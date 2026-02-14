import process from "node:process";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function chunk(items, size) {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function buildHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "repodigest-kpi-script",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function ghRequest(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function ghCollection(path, params, key, headers) {
  const items = [];
  let page = 1;
  while (true) {
    const url = new URL(`https://api.github.com${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const data = await ghRequest(url, headers);
    const batch = key ? data[key] ?? [] : data;
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    items.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }
  return items;
}

async function ghArrayPage(path, params, page, headers) {
  const url = new URL(`https://api.github.com${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  return ghRequest(url, headers);
}

function isDocsIssue(issue) {
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((item) => (typeof item === "string" ? item : item?.name ?? "")).filter(Boolean)
    : [];
  const labelHit = labels.some((label) => /(docs?|documentation|readme|config)/i.test(label));
  const text = `${issue.title ?? ""}\n${issue.body ?? ""}`;
  const textHit = /\b(docs?|documentation|readme|config)\b/i.test(text);
  return labelHit || textHit;
}

function hasBugAndCriticalLabels(issue) {
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((item) => (typeof item === "string" ? item : item?.name ?? "")).filter(Boolean)
    : [];
  const hasBug = labels.some((label) => /\bbug\b/i.test(label));
  const hasCritical = labels.some((label) => /(critical|sev-?1|p0)/i.test(label));
  return hasBug && hasCritical;
}

async function ciPassRate(owner, repo, workflowName, sinceIso, headers) {
  const workflowsUrl = new URL(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`);
  workflowsUrl.searchParams.set("per_page", "100");
  const workflowsData = await ghRequest(workflowsUrl, headers);
  const workflows = workflowsData.workflows ?? [];
  const workflow = workflows.find((item) => item.name === workflowName);
  if (!workflow) {
    return null;
  }

  const runs = await ghCollection(
    `/repos/${owner}/${repo}/actions/workflows/${workflow.id}/runs`,
    { event: "push" },
    "workflow_runs",
    headers
  );

  const completed = runs.filter((run) => {
    if (run.status !== "completed") {
      return false;
    }
    return new Date(run.created_at).getTime() >= new Date(sinceIso).getTime();
  });

  if (completed.length === 0) {
    return {
      workflow: workflow.name,
      success: 0,
      total: 0,
      passRate: null
    };
  }

  const success = completed.filter((run) => run.conclusion === "success").length;
  return {
    workflow: workflow.name,
    success,
    total: completed.length,
    passRate: success / completed.length
  };
}

async function issueMetrics(owner, repo, sinceIso, maxIssues, headers) {
  const allIssues = await ghCollection(
    `/repos/${owner}/${repo}/issues`,
    { state: "all", since: sinceIso, sort: "created", direction: "desc" },
    null,
    headers
  );

  const issues = allIssues.filter((issue) => !issue.pull_request).slice(0, maxIssues);
  if (issues.length === 0) {
    return {
      total: 0,
      docsCount: 0,
      docsRatio: null,
      responded: 0,
      medianResponseHours: null
    };
  }

  const docsCount = issues.filter(isDocsIssue).length;
  const responseHours = [];

  for (const issue of issues) {
    if (!issue.comments || issue.comments <= 0) {
      continue;
    }

    const comments = await ghCollection(
      `/repos/${owner}/${repo}/issues/${issue.number}/comments`,
      { sort: "created", direction: "asc" },
      null,
      headers
    );

    const firstResponse = comments.find((comment) => comment.user?.login !== issue.user?.login);
    if (!firstResponse) {
      continue;
    }
    const createdAt = new Date(issue.created_at).getTime();
    const responseAt = new Date(firstResponse.created_at).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(responseAt) || responseAt < createdAt) {
      continue;
    }
    responseHours.push((responseAt - createdAt) / 3_600_000);
  }

  return {
    total: issues.length,
    docsCount,
    docsRatio: docsCount / issues.length,
    responded: responseHours.length,
    medianResponseHours: median(responseHours)
  };
}

async function escapedCriticalSinceLatestRelease(owner, repo, headers) {
  const releases = await ghCollection(
    `/repos/${owner}/${repo}/releases`,
    {},
    null,
    headers
  );

  if (releases.length === 0) {
    return null;
  }

  const latest = releases
    .filter((release) => release.published_at)
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())[0];

  if (!latest) {
    return null;
  }

  const issues = await ghCollection(
    `/repos/${owner}/${repo}/issues`,
    { state: "all", since: latest.published_at, sort: "created", direction: "desc" },
    null,
    headers
  );
  const bugIssues = issues.filter((issue) => !issue.pull_request);
  const escaped = bugIssues.filter(hasBugAndCriticalLabels).length;

  return {
    latestReleaseTag: latest.tag_name,
    latestReleaseDate: latest.published_at,
    escapedCriticalBugs: escaped
  };
}

async function returningContributors(owner, repo, headers) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartIso = monthStart.toISOString();
  const monthStartDate = monthStartIso.slice(0, 10);

  let page = 1;
  const currentMonthAuthors = new Set();
  while (true) {
    const pulls = await ghArrayPage(
      `/repos/${owner}/${repo}/pulls`,
      { state: "all", sort: "created", direction: "desc" },
      page,
      headers
    );

    if (!Array.isArray(pulls) || pulls.length === 0) {
      break;
    }

    let shouldStop = false;
    for (const pr of pulls) {
      if (!pr.created_at) {
        continue;
      }
      const createdAt = new Date(pr.created_at).getTime();
      if (createdAt < monthStart.getTime()) {
        shouldStop = true;
        continue;
      }
      if (pr.user?.login) {
        currentMonthAuthors.add(pr.user.login);
      }
    }

    if (shouldStop) {
      break;
    }
    page += 1;
    if (page > 10) {
      break;
    }
  }

  const authors = [...currentMonthAuthors];
  if (authors.length === 0) {
    return { month: monthStartDate.slice(0, 7), currentMonthAuthors: 0, returningAuthors: 0 };
  }

  let returning = 0;
  for (const group of chunk(authors, 10)) {
    await Promise.all(
      group.map(async (login) => {
        const query = `repo:${owner}/${repo} is:pr author:${login} created:<${monthStartDate}`;
        const url = new URL("https://api.github.com/search/issues");
        url.searchParams.set("q", query);
        url.searchParams.set("per_page", "1");
        const data = await ghRequest(url, headers);
        if ((data.total_count ?? 0) > 0) {
          returning += 1;
        }
      })
    );
  }

  return { month: monthStartDate.slice(0, 7), currentMonthAuthors: authors.length, returningAuthors: returning };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRef = args.repo ?? process.env.REPODIGEST_KPI_REPO;
  if (!repoRef || !/^[^/\s]+\/[^/\s]+$/.test(repoRef)) {
    throw new Error("Missing or invalid --repo owner/name (or REPODIGEST_KPI_REPO).");
  }

  const [owner, repo] = repoRef.split("/");
  const days = Number.parseInt(args.days ?? "30", 10);
  const workflowName = args.workflow ?? "CI";
  const maxIssues = Number.parseInt(args.maxIssues ?? "50", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const headers = buildHeaders(process.env.GITHUB_TOKEN);

  const ci = await ciPassRate(owner, repo, workflowName, since, headers);
  const issues = await issueMetrics(owner, repo, since, maxIssues, headers);
  const escaped = await escapedCriticalSinceLatestRelease(owner, repo, headers);
  const returning = await returningContributors(owner, repo, headers);

  console.log(`GitHub KPI (${owner}/${repo})`);
  console.log(`- Window: last ${days} days (since ${since.slice(0, 10)})`);
  if (!ci) {
    console.log(`- CI pass rate (${workflowName}): workflow not found`);
  } else if (ci.passRate === null) {
    console.log(`- CI pass rate (${ci.workflow}): no completed runs`);
  } else {
    console.log(`- CI pass rate (${ci.workflow}): ${(ci.passRate * 100).toFixed(1)}% (${ci.success}/${ci.total})`);
  }

  if (issues.docsRatio === null) {
    console.log("- Docs-related issue ratio: no issues in window");
    console.log("- Median issue first-response: no issues in window");
  } else {
    console.log(`- Docs-related issue ratio: ${(issues.docsRatio * 100).toFixed(1)}% (${issues.docsCount}/${issues.total})`);
    if (issues.medianResponseHours === null) {
      console.log("- Median issue first-response: no issue responses found");
    } else {
      console.log(
        `- Median issue first-response: ${issues.medianResponseHours.toFixed(1)}h (responded ${issues.responded}/${issues.total})`
      );
    }
  }

  if (!escaped) {
    console.log("- Escaped critical bugs per release: no published release found");
  } else {
    console.log(
      `- Escaped critical bugs since ${escaped.latestReleaseTag} (${escaped.latestReleaseDate.slice(0, 10)}): ${escaped.escapedCriticalBugs}`
    );
  }

  console.log(
    `- Returning contributors (${returning.month}): ${returning.returningAuthors}/${returning.currentMonthAuthors}`
  );
}

main().catch((error) => {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`GitHub KPI script failed: ${message}`);
});
