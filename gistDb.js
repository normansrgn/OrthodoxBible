let octokitPromise = null;

async function getOctokit() {
  if (octokitPromise) return octokitPromise;

  octokitPromise = (async () => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN is not set');
    }

    // @octokit/rest is ESM in recent versions -> use dynamic import
    const mod = await import('@octokit/rest');
    const Octokit = mod.Octokit || mod.default?.Octokit || mod.default;
    if (!Octokit) {
      throw new Error('Failed to load Octokit from @octokit/rest');
    }

    return new Octokit({ auth: token });
  })();

  return octokitPromise;
}

function getConfig() {
  const gistId = process.env.GIST_ID;
  const filename = process.env.GIST_FILENAME || 'users_data.json';
  return { gistId, filename };
}

async function checkGistAccess() {
  const { gistId } = getConfig();
  if (!process.env.GITHUB_TOKEN) return false;
  if (!gistId) return false;
  try {
    const octokit = await getOctokit();
    await octokit.gists.get({ gist_id: gistId });
    return true;
  } catch {
    return false;
  }
}

async function loadDbFromGist() {
  const { gistId, filename } = getConfig();
  if (!gistId) throw new Error('GIST_ID is not set');

  const octokit = await getOctokit();
  const res = await octokit.gists.get({ gist_id: gistId });
  const content = res.data?.files?.[filename]?.content;
  if (!content) return {};
  return JSON.parse(content);
}

async function saveDbToGist(db) {
  const { gistId, filename } = getConfig();
  if (!gistId) throw new Error('GIST_ID is not set');

  const octokit = await getOctokit();
  await octokit.gists.update({
    gist_id: gistId,
    files: {
      [filename]: {
        content: JSON.stringify(db, null, 2),
      },
    },
  });
  return true;
}

module.exports = {
  checkGistAccess,
  loadDbFromGist,
  saveDbToGist,
};

