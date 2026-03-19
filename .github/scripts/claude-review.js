const Anthropic = require('@anthropic-ai/sdk');
const { execSync } = require('child_process');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getDiff() {
  return execSync(`git diff ${process.env.BASE_SHA}...${process.env.HEAD_SHA}`, {
    maxBuffer: 1024 * 1024 * 10, // 10MB
  }).toString();
}

async function postReview(body) {
  const [owner, repo] = process.env.REPO.split('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${process.env.PR_NUMBER}/comments`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ body }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} - ${err}`);
  }

  console.log('Review posted successfully.');
}

async function main() {
  const diff = await getDiff();

  if (!diff.trim()) {
    console.log('No diff found, skipping review.');
    return;
  }

  // Truncate if the diff is huge (Opus context is large but let's be safe)
  const MAX_DIFF_CHARS = 80000;
  const truncated = diff.length > MAX_DIFF_CHARS;
  const diffContent = truncated
    ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[...diff truncated due to size...]'
    : diff;

  const prompt = `You are an expert code reviewer. Review the following pull request and provide actionable, specific feedback.

PR Title: ${process.env.PR_TITLE}
PR Description: ${process.env.PR_BODY || 'No description provided.'}

## Diff
\`\`\`diff
${diffContent}
\`\`\`

Please review this PR and provide feedback covering:
1. **Summary** – Brief overview of what this PR does
2. **Issues** – Bugs, logic errors, security concerns, or performance problems (if any)
3. **Suggestions** – Improvements to readability, structure, or best practices
4. **Nitpicks** – Minor style or convention notes (optional, keep brief)

Be direct and specific. Reference file names and line context where relevant. If the PR looks good, say so.`;

  console.log('Sending diff to Claude Opus 4.6...');

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const review = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const comment = `## 🤖 Claude Opus Code Review\n\n${review}\n\n---\n*Reviewed by [Claude Opus 4.6](https://anthropic.com)*`;

  await postReview(comment);
}

main().catch((err) => {
  console.error('Review failed:', err);
  process.exit(1);
});
