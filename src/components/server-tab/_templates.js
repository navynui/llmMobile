import { html } from 'lit';

export function renderServerTab(ctx) {
  return html`
    <div class="server-tab">
      <!-- Status Card (Server status + Metrics) -->
      <server-status-card
        .stats="${ctx.stats}"
        .status="${ctx.status}"
        .actionPending="${ctx.actionPending}"
        @start="${() => ctx.handleServerToggle()}"
        @stop="${() => ctx.handleServerToggle()}"
        @restart="${() => ctx.handleRestart()}"
        @free-comfy="${() => ctx.handleFreeComfyUI()}"
      >
      </server-status-card>

      <!-- Models Configuration Manager -->
      <models-config-editor
        .models="${ctx.models}"
        .activeModel="${ctx.activeModel}"
        .loadingModel="${ctx.loadingModel}"
        .actionPending="${ctx.actionPending}"
        .modelsIniText="${ctx.modelsIniText}"
        .modelsIniLoading="${ctx.modelsIniLoading}"
        .isServerRunning="${ctx.status?.server?.status === 'running'}"
        @select-model-change="${(e) => ctx.handleSelectModelChange(e)}"
        @load-model="${(e) => ctx.handleModelLoad(e.detail.model)}"
        @unload-model="${() => ctx.handleModelUnload()}"
        @delete-model="${(e) => ctx.executeDeleteModel(e.detail.filename)}"
        @change="${(e) => ctx.modelsIniText = e.detail.text}"
        @scan="${() => ctx.handleScanAndRegister()}"
        @reload="${() => ctx.fetchModelsIni()}"
        @save="${() => ctx.saveModelsIni()}"
      >
      </models-config-editor>

      <!-- HF Downloader -->
      <model-downloader
        .hfSearchQuery="${ctx.hfSearchQuery}"
        .hfSearchLoading="${ctx.hfSearchLoading}"
        .hfSearchResults="${ctx.hfSearchResults}"
        .hfSelectedRepo="${ctx.hfSelectedRepo}"
        .hfRepoDetails="${ctx.hfRepoDetails}"
        .hfDetailsLoading="${ctx.hfDetailsLoading}"
        .hfActiveDownloads="${ctx.hfActiveDownloads}"
        @query-change="${(e) => ctx.hfSearchQuery = e.detail.query}"
        @search="${() => ctx.handleHfSearch()}"
        @select-repo="${(e) => ctx.selectHfRepo(e.detail.repoId)}"
        @download="${(e) => ctx.triggerHfDownload(e.detail.filename)}"
        @stop-download="${(e) => ctx.handleStopDownload(e.detail.key)}"
        @resume-download="${(e) => ctx.handleResumeDownload(e.detail.key)}"
        @cancel-download="${(e) => ctx.handleCancelDownload(e.detail.key)}"
        @clear-finished="${() => ctx._handleClearFinishedDownloads()}"
      >
      </model-downloader>

      <!-- Server Logs -->
      <server-logs
        .logsText="${ctx.logsText}"
        .logContainer="${ctx.logContainer}"
        .logLimit="${ctx.logLimit}"
        .logsLoading="${ctx.logsLoading}"
        @refresh="${() => ctx.fetchLogs()}"
        @container-change="${(e) => ctx.switchLogsTab(e.detail.container)}"
        @limit-change="${(e) => ctx.handleLogLimitChange(e)}"
      >
      </server-logs>

      <!-- Status Message Feed -->
      ${ctx.statusMessage ? html`<div class="status-msg">${ctx.statusMessage}</div>` : ''}
    </div>
  `;
}
