import { LitElement, html } from 'lit';
import { modelsConfigStyles } from './models-config-editor/_styles.js';
import { 
  renderModelSwitcher, 
  renderModelsConfig, 
  renderEditIni, 
  renderDeleteModal 
} from './models-config-editor/_templates.js';

export class ModelsConfigEditor extends LitElement {
  static properties = {
    models: { type: Array },
    activeModel: { type: String },
    loadingModel: { type: Boolean },
    actionPending: { type: Boolean },
    modelsIniText: { type: String },
    modelsIniLoading: { type: Boolean },
    isServerRunning: { type: Boolean },
    iniLabel: { type: String },
    server: { type: String },
    
    // Local UI states
    switcherExpanded: { type: Boolean },
    configExpanded: { type: Boolean },
    iniExpanded: { type: Boolean },
    modelToDelete: { type: String }
  };

  static styles = modelsConfigStyles;

  constructor() {
    super();
    this.models = [];
    this.activeModel = '';
    this.loadingModel = false;
    this.actionPending = false;
    this.modelsIniText = '';
    this.modelsIniLoading = false;
    this.isServerRunning = false;
    this.iniLabel = 'models.ini';
    this.server = 'primary';
    this.switcherExpanded = false;
    this.configExpanded = false;
    this.iniExpanded = false;
    this.modelToDelete = null;
  }

  toggleSwitcher() {
    this.switcherExpanded = !this.switcherExpanded;
  }

  toggleConfig() {
    this.configExpanded = !this.configExpanded;
  }

  toggleIni() {
    this.iniExpanded = !this.iniExpanded;
  }

  render() {
    return html`
      <div class="card-container">
        ${renderModelSwitcher(this)}
        ${renderModelsConfig(this)}
        ${renderEditIni(this)}
      </div>
      ${renderDeleteModal(this)}
    `;
  }
}

customElements.define('models-config-editor', ModelsConfigEditor);
