export class UpdateChecker {
  constructor(owner, repo) {
    this.owner = owner;
    this.repo = repo;
  }

  getRepositoryUrl() {
    return `https://github.com/${this.owner}/${this.repo}`;
  }

  getLatestReleaseApiUrl() {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`;
  }

  extractReleaseNotes(body) {
    const lines = String(body ?? '')
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith('#'));

    const cleaned = [];

    for (const raw of lines) {
      const text = raw.replace(/^[-*]\s+/, '').trim();
      if (!text) continue;
      cleaned.push(text);
      if (cleaned.length >= 4) break;
    }

    return cleaned.length > 0 ? cleaned : ['No release notes published yet.'];
  }

  async fetchLatestRelease() {
    const response = await fetch(this.getLatestReleaseApiUrl(), {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}`);
    }

    const data = await response.json();

    return {
      version: String(data?.tag_name || '').trim() || 'v0.0.0',
      date: data?.published_at ?? null,
      notes: this.extractReleaseNotes(data?.body),
      releaseUrl:
        typeof data?.html_url === 'string' && data.html_url
          ? data.html_url
          : this.getRepositoryUrl(),
    };
  }
}
