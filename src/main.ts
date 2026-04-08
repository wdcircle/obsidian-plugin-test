// main.ts
import { App, Editor, ItemView, MarkdownView, Menu, Modal, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab } from "./settings";

// ============================
// 코드 뷰어 패널 (ItemView)
// ============================
export const CODE_VIEWER_VIEW_TYPE = 'pharos-code-viewer';

export class CodeViewerView extends ItemView {
	plugin: MyPlugin;
	private recentPaths: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() { return CODE_VIEWER_VIEW_TYPE; }
	getDisplayText() { return 'Pharos 코드 뷰어'; }
	getIcon() { return 'code'; }

	async onOpen() {
		await this.render();
	}

	async render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('pharos-viewer-root');

		const style = container.createEl('style');
		style.textContent = `
            .pharos-viewer-root { display: flex; flex-direction: column; height: 100%; font-family: var(--font-interface); overflow: hidden; }
            .pharos-toolbar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-secondary); flex-shrink: 0; }
            .pharos-toolbar select { flex: 1; font-size: 12px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 3px 6px; }
            .pharos-toolbar button { font-size: 12px; padding: 3px 8px; border-radius: 4px; cursor: pointer; background: var(--interactive-accent); color: var(--text-on-accent); border: none; }
            .pharos-body { display: flex; flex: 1; overflow: hidden; }
            .pharos-file-tree { width: 200px; min-width: 140px; border-right: 1px solid var(--background-modifier-border); overflow-y: auto; background: var(--background-secondary); flex-shrink: 0; }
            .pharos-file-tree-header { font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 8px 10px 4px; text-transform: uppercase; }
            .pharos-file-item { display: flex; align-items: center; gap: 5px; padding: 4px 10px; font-size: 12px; cursor: pointer; border-left: 2px solid transparent; }
            .pharos-file-item.active { background: var(--background-modifier-active-hover); border-left-color: var(--interactive-accent); color: var(--interactive-accent); font-weight: 600; }
            .pharos-code-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            .pharos-code-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border); font-size: 12px; }
            .pharos-code-scroll { flex: 1; overflow: auto; background: var(--background-primary); }
            .pharos-code-scroll pre { margin: 0; padding: 16px; font-size: 12px; line-height: 1.6; font-family: var(--font-monospace); white-space: pre; }
            .pharos-recent-badge { font-size: 9px; background: #f59e0b; color: white; padding: 1px 4px; border-radius: 3px; margin-left: 4px; }
        `;

		const toolbar = container.createDiv({ cls: 'pharos-toolbar' });
		const branchSelect = toolbar.createEl('select');
		const refreshBtn = toolbar.createEl('button', { text: '🔄' });

		const body = container.createDiv({ cls: 'pharos-body' });
		const fileTree = body.createDiv({ cls: 'pharos-file-tree' });
		const codePanel = body.createDiv({ cls: 'pharos-code-panel' });

		const loadTree = async () => {
			fileTree.empty();
			const branch = branchSelect.value;
			try {
				this.recentPaths = await this.plugin.fetchRecentlyChangedFiles(branch);
				const tree = await this.plugin.fetchFileTree(branch);
				this.renderTree(fileTree, tree, codePanel, branchSelect);
			} catch {
				fileTree.createDiv({ text: '❌ 로드 실패' });
			}
		};

		refreshBtn.addEventListener('click', loadTree);
		branchSelect.addEventListener('change', loadTree);

		try {
			const branches = await this.plugin.fetchBranches();
			branches.forEach((b: any) => {
				const opt = branchSelect.createEl('option', { text: b.name });
				opt.value = b.name;
			});
			await loadTree();
		} catch (e) {
			branchSelect.createEl('option', { text: '로드 실패' });
		}
	}

	renderTree(parent: HTMLElement, items: GithubTreeItem[], codePanel: HTMLElement, branchSelect: HTMLSelectElement) {
		parent.empty();
		parent.createDiv({ cls: 'pharos-file-tree-header', text: '📁 파일 목록' });

		const grouped: { [key: string]: GithubTreeItem[] } = {};
		const rootFiles: GithubTreeItem[] = [];

		items.forEach(item => {
			const parts = item.path.split('/');
			if (parts.length === 1) {
				rootFiles.push(item);
			} else {
				const folder = parts[0] as string;
				if (!grouped[folder]) grouped[folder] = [];
				grouped[folder].push(item);
			}
		});

		rootFiles.forEach(item => this.renderFileItem(parent, item, codePanel, branchSelect));
		Object.entries(grouped).forEach(([folder, files]) => {
			parent.createDiv({ cls: 'pharos-file-item folder', text: `📁 ${folder}` });
			files.forEach(item => {
				const el = this.renderFileItem(parent, item, codePanel, branchSelect);
				el.style.paddingLeft = '20px';
			});
		});
	}

	renderFileItem(parent: HTMLElement, item: GithubTreeItem, codePanel: HTMLElement, branchSelect: HTMLSelectElement) {
		const isRecent = this.recentPaths.has(item.path);
		const el = parent.createDiv({ cls: `pharos-file-item${isRecent ? ' recent' : ''}` });
		el.createSpan({ text: getFileIcon(item.path.split('.').pop() || '') + ' ' });
		el.createSpan({ text: item.path.split('/').pop() || item.path });
		if (isRecent) el.createSpan({ cls: 'pharos-recent-badge', text: 'NEW' });

		el.addEventListener('click', async () => {
			parent.querySelectorAll('.pharos-file-item').forEach(e => e.removeClass('active'));
			el.addClass('active');
			await this.loadCode(item.path, codePanel, branchSelect.value);
		});
		return el;
	}

	async loadCode(path: string, codePanel: HTMLElement, branch: string) {
		codePanel.empty();
		const header = codePanel.createDiv({ cls: 'pharos-code-header' });
		header.createSpan({ text: `📄 ${path}` });

		const scrollEl = codePanel.createDiv({ cls: 'pharos-code-scroll' });
		try {
			const { content } = await this.plugin.fetchFileContent(path, branch);
			const pre = scrollEl.createEl('pre');
			pre.setText(content);
		} catch {
			scrollEl.setText('❌ 파일 로드 실패');
		}
	}

	async onClose() { }
}

// ============================
// 팀 커밋 현황 모달
// ============================
class TeamCommitModal extends Modal {
	plugin: MyPlugin;
	constructor(app: App, plugin: MyPlugin) { super(app); this.plugin = plugin; }

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: '👥 팀 커밋 현황' });

		const controlRow = contentEl.createDiv({ cls: 'pharos-control-row' });
		const rangeSelect = controlRow.createEl('select');
		[{ v: 'today', l: '오늘' }, { v: 'week', l: '이번 주' }, { v: 'month', l: '이번 달' }, { v: 'all', l: '전체' }].forEach(opt => {
			const o = rangeSelect.createEl('option', { text: opt.l });
			o.value = opt.v;
		});

		const refreshBtn = controlRow.createEl('button', { text: '🔄 새로고침' });
		const tableContainer = contentEl.createDiv();

		const loadData = async () => {
			tableContainer.empty();
			tableContainer.setText('불러오는 중...');
			try {
				const since = this.getSinceDate(rangeSelect.value);
				const data = await this.plugin.fetchTeamCommits(since);
				this.renderTable(tableContainer, data);
			} catch { tableContainer.setText('❌ 로드 실패'); }
		};

		refreshBtn.addEventListener('click', loadData);
		rangeSelect.addEventListener('change', loadData);

		// 스타일 추가
		contentEl.createEl('style', {
			text: `
            .pharos-control-row { display: flex; gap: 8px; margin-bottom: 10px; }
            .pharos-rank-1 { color: gold; font-weight: bold; }
            .pharos-rank-2 { color: silver; }
            .pharos-rank-3 { color: #cd7f32; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid var(--background-modifier-border); padding: 8px; text-align: left; }
        `});

		await loadData();
	}

	getSinceDate(range: string): string | null {
		const now = new Date();
		if (range === 'today') return new Date(now.setHours(0, 0, 0, 0)).toISOString();
		if (range === 'week') return new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
		if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
		return null;
	}

	renderTable(container: HTMLElement, data: any[]) {
		container.empty();
		const table = container.createEl('table');
		const header = table.createEl('thead').createEl('tr');
		['순위', '팀원', '커밋'].forEach(h => header.createEl('th', { text: h }));

		const tbody = table.createEl('tbody');
		const rankClass: string[] = ['pharos-rank-1', 'pharos-rank-2', 'pharos-rank-3'];
		data.sort((a, b) => b.commits - a.commits).forEach((m, i) => {
			const row = tbody.createEl('tr');
			const rankCell = row.createEl('td', { text: `${i + 1}위` });
			if (i < 3 && rankClass[i]) rankCell.addClass(rankClass[i] as string);
			row.createEl('td', { text: m.author });
			row.createEl('td', { text: `${m.commits}회` });
		});
	}
	onClose() { this.contentEl.empty(); }
}

// ============================
// 메인 플러그인 클래스
// ============================
export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(CODE_VIEWER_VIEW_TYPE, (leaf) => new CodeViewerView(leaf, this));

		this.addRibbonIcon('cloud', 'Pharos GitHub', (evt) => {
			const menu = new Menu();

			// 1. 코드 뷰어
			menu.addItem(item => item.setTitle('📂 코드 뷰어 열기').setIcon('code').onClick(() => this.openCodeViewer()));

			// 2. 현재 파일 업로드 (기존 기능)
			menu.addItem(item => item.setTitle('현재 파일 업로드 (API)').setIcon('file-up').onClick(async () => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView && activeView.file) {
					const content = await this.app.vault.read(activeView.file);
					await this.uploadToGithub(activeView.file.name, content);
				} else {
					new Notice('열려있는 노트가 없습니다.');
				}
			}));

			// 3. 팀 커밋 현황 (기존 기능)
			menu.addItem(item => item.setTitle('👥 팀 커밋 현황').setIcon('users').onClick(() => new TeamCommitModal(this.app, this).open()));

			// 4. 저장소 바로가기
			menu.addItem(item => item.setTitle('내 저장소 바로가기').setIcon('external-link').onClick(() => window.open(`https://github.com/${this.settings.userName}/${this.settings.repoName}`)));

			menu.showAtMouseEvent(evt);
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	async openCodeViewer() {
		const leaves = this.app.workspace.getLeavesOfType(CODE_VIEWER_VIEW_TYPE);
		if (leaves.length > 0 && leaves[0]) {
			this.app.workspace.revealLeaf(leaves[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CODE_VIEWER_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	// API 메서드들
	async fetchBranches() {
		const res = await fetch(`https://api.github.com/repos/${this.settings.userName}/${this.settings.repoName}/branches`, { headers: this.githubHeaders() });
		return res.json();
	}

	async fetchFileTree(branch: string): Promise<GithubTreeItem[]> {
		const res = await fetch(`https://api.github.com/repos/${this.settings.userName}/${this.settings.repoName}/git/trees/${branch}?recursive=1`, { headers: this.githubHeaders() });
		const data = await res.json();
		return (data.tree as GithubTreeItem[]).filter(i => i.type === 'blob' && !i.path.startsWith('.git'));
	}

	async fetchRecentlyChangedFiles(branch: string): Promise<Set<string>> {
		const res = await fetch(`https://api.github.com/repos/${this.settings.userName}/${this.settings.repoName}/commits?sha=${branch}&per_page=5`, { headers: this.githubHeaders() });
		if (!res.ok) return new Set();
		const commits = await res.json();
		const paths = new Set<string>();
		for (const c of commits.slice(0, 3)) {
			const detail = await (await fetch(`https://api.github.com/repos/${this.settings.userName}/${this.settings.repoName}/commits/${c.sha}`, { headers: this.githubHeaders() })).json();
			detail.files?.forEach((f: any) => paths.add(f.filename));
		}
		return paths;
	}

	async fetchFileContent(path: string, branch: string) {
		const res = await fetch(`https://api.github.com/repos/${this.settings.userName}/${this.settings.repoName}/contents/${path}?ref=${branch}`, { headers: this.githubHeaders() });
		const data = await res.json();
		const decoded = decodeURIComponent(atob(data.content.replace(/\s/g, '')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
		return { content: decoded };
	}

	async uploadToGithub(fileName: string, content: string) {
		const url = `https://api.github.com/repos/${this.settings.userName}/${this.settings.repoName}/contents/${fileName}`;
		try {
			const check = await fetch(url, { headers: this.githubHeaders() });
			const sha = check.ok ? (await check.json()).sha : null;
			const res = await fetch(url, {
				method: 'PUT',
				headers: { ...this.githubHeaders(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: `Update ${fileName}`, content: btoa(unescape(encodeURIComponent(content))), sha })
			});
			if (res.ok) new Notice('업로드 성공! 🎉');
			else new Notice('업로드 실패');
		} catch { new Notice('네트워크 오류'); }
	}

	async fetchTeamCommits(since: string | null) {
		const target = this.settings.teamRepo || this.settings.repoName;
		let url = `https://api.github.com/repos/${this.settings.userName}/${target}/commits?per_page=100`;
		if (since) url += `&since=${since}`;
		const res = await fetch(url, { headers: this.githubHeaders() });
		const commits = await res.json();
		const map: any = {};
		commits.forEach((c: any) => {
			const author = c.author?.login || 'unknown';
			if (!map[author]) map[author] = { commits: 0, avatar: c.author?.avatar_url };
			map[author].commits++;
		});
		return Object.entries(map).map(([author, v]: any) => ({ author, commits: v.commits, avatar: v.avatar }));
	}

	private githubHeaders() {
		return { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${this.settings.ghToken}` };
	}

	async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
	async saveSettings() { await this.saveData(this.settings); }
}

interface GithubTreeItem { path: string; type: 'blob' | 'tree'; sha: string; }
function getFileIcon(ext: string) {
	const icons: any = { ts: '🟦', js: '🟨', md: '📝', py: '🐍', html: '🌐', css: '🎨' };
	return icons[ext] || '📄';
}