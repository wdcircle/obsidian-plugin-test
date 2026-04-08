// settings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	ghToken: string;
	userName: string;
	repoName: string;
	teamRepo: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	ghToken: '',
	userName: '',
	repoName: '',
	teamRepo: '',
};

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: '🔧 Pharos 설정' });

		// ── GitHub 인증 ──────────────────────────
		containerEl.createEl('h3', { text: 'GitHub 인증' });

		new Setting(containerEl)
			.setName('GitHub Token')
			.setDesc('GitHub Personal Access Token (repo 권한 필요)')
			.addText(text => text
				.setPlaceholder('ghp_xxxxxxxxxxxx')
				.setValue(this.plugin.settings.ghToken)
				.onChange(async (value) => {
					this.plugin.settings.ghToken = value.trim();
					await this.plugin.saveSettings();
				})
			);

		// ── 개인 레포지토리 ──────────────────────
		containerEl.createEl('h3', { text: '개인 레포지토리' });

		new Setting(containerEl)
			.setName('GitHub 사용자명')
			.setDesc('예: wdcircle')
			.addText(text => text
				.setPlaceholder('your-username')
				.setValue(this.plugin.settings.userName)
				.onChange(async (value) => {
					this.plugin.settings.userName = value.trim();
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('개인 레포 이름')
			.setDesc('노트를 업로드할 본인 레포지토리 이름')
			.addText(text => text
				.setPlaceholder('-my-notes')
				.setValue(this.plugin.settings.repoName)
				.onChange(async (value) => {
					this.plugin.settings.repoName = value.trim();
					await this.plugin.saveSettings();
				})
			);

		// ── 팀 레포지토리 ────────────────────────
		containerEl.createEl('h3', { text: '팀 레포지토리' });

		new Setting(containerEl)
			.setName('팀 레포 이름')
			.setDesc('팀 커밋 현황을 조회할 레포지토리 이름 (비워두면 개인 레포 사용)')
			.addText(text => text
				.setPlaceholder('team-project-repo')
				.setValue(this.plugin.settings.teamRepo)
				.onChange(async (value) => {
					this.plugin.settings.teamRepo = value.trim();
					await this.plugin.saveSettings();
				})
			);

		// ── 저장소 바로가기 버튼 ─────────────────
		containerEl.createEl('h3', { text: '빠른 이동' });

		new Setting(containerEl)
			.setName('개인 저장소 열기')
			.setDesc('설정된 개인 레포를 GitHub에서 바로 열기')
			.addButton(btn => btn
				.setButtonText('열기 🔗')
				.onClick(() => {
					const { userName, repoName } = this.plugin.settings;
					if (userName && repoName) {
						window.open(`https://github.com/${userName}/${repoName}`);
					} else {
						// Notice는 main.ts에서 import되므로 여기선 alert 사용
						alert('사용자명과 레포 이름을 먼저 입력하세요.');
					}
				})
			);

		new Setting(containerEl)
			.setName('팀 저장소 열기')
			.setDesc('설정된 팀 레포를 GitHub에서 바로 열기')
			.addButton(btn => btn
				.setButtonText('열기 🔗')
				.onClick(() => {
					const { userName, teamRepo, repoName } = this.plugin.settings;
					const target = teamRepo || repoName;
					if (userName && target) {
						window.open(`https://github.com/${userName}/${target}`);
					} else {
						alert('사용자명과 레포 이름을 먼저 입력하세요.');
					}
				})
			);
	}
}