const Anthropic = require("@anthropic-ai/sdk");
const { execSync } = require("child_process");

const client = new Anthropic();

async function main() {
  const {
    PR_NUMBER,
    REPO,
    BASE_SHA,
    HEAD_SHA,
    PR_TITLE,
    PR_BODY,
    GITHUB_TOKEN,
  } = process.env;

  if (!PR_NUMBER || !REPO || !BASE_SHA || !HEAD_SHA) {
    console.error("Missing required environment variables");
    process.exit(1);
  }

  // Get the diff
  let diff;
  try {
    diff = execSync(`git diff ${BASE_SHA}...${HEAD_SHA}`, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });
  } catch (e) {
    console.error("Failed to get diff:", e.message);
    process.exit(1);
  }

  if (!diff.trim()) {
    console.log("No diff found, skipping review");
    return;
  }

  // Truncate diff if too large
  const MAX_DIFF = 100000;
  const truncated = diff.length > MAX_DIFF;
  if (truncated) {
    diff = diff.slice(0, MAX_DIFF) + "\n\n... (diff truncated)";
  }

  // Get changed files list
  const files = execSync(`git diff --name-only ${BASE_SHA}...${HEAD_SHA}`, {
    encoding: "utf-8",
  }).trim();

  const prompt = `You are reviewing a pull request for SMSHub, a multi-platform SMS messaging app built with Next.js, TypeScript, Supabase, and TailwindCSS.

## PR: ${PR_TITLE}

${PR_BODY || "No description provided."}

## Changed Files:
${files}

## Diff:
\`\`\`diff
${diff}
\`\`\`

Please review this PR and provide:

1. **Summary** — Brief description of what this PR does
2. **Issues** — Any bugs, security concerns, or logic errors (be specific with file:line references)
3. **Suggestions** — Improvements for code quality, performance, or maintainability
4. **Verdict** — APPROVE, REQUEST_CHANGES, or COMMENT

Keep your review concise and actionable. Focus on real issues, not style nitpicks. If the code looks good, say so briefly.`;

  console.log("Requesting Claude review...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const review = response.content[0].text;
  console.log("Review received, posting to PR...");

  // Post review as PR comment
  const body = `## 🤖 Claude Code Review\n\n${review}\n\n---\n*Automated review by Claude*`;

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({ body }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed to post comment:", res.status, err);
    process.exit(1);
  }

  console.log("Review posted successfully!");
}

main().catch((err) => {
  console.error("Review failed:", err);
  process.exit(1);
});
