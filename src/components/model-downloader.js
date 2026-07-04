import { LitElement, html } from 'lit';
import { modelDownloaderStyles } from './model-downloader/_styles.js';
import { renderModelDownloader } from './model-downloader/_templates.js';

export class ModelDownloader extends LitElement {
  static properties = {
    hfSearchQuery: { type: String },
    hfSearchLoading: { type: Boolean },
    hfSearchResults: { type: Array },
    hfSelectedRepo: { type: String },
    hfRepoDetails: { type: Object },
    hfDetailsLoading: { type: Boolean },
    hfActiveDownloads: { type: Array },
    downloaderExpanded: { type: Boolean }
  };

  static styles = modelDownloaderStyles;

  constructor() {
    super();
    this.hfSearchQuery = '';
    this.hfSearchLoading = false;
    this.hfSearchResults = [];
    this.hfSelectedRepo = '';
    this.hfRepoDetails = null;
    this.hfDetailsLoading = false;
    this.hfActiveDownloads = [];
    this.downloaderExpanded = false;
    this._restoreExpandedState();
  }

  _restoreExpandedState() {
    try {
      const raw = localStorage.getItem('hf_downloader_expanded');
      if (raw === 'true') {
        this.downloaderExpanded = true;
      }
    } catch (e) {
      // ignore
    }
  }

  _saveExpandedState() {
    try {
      localStorage.setItem('hf_downloader_expanded', String(this.downloaderExpanded));
    } catch (e) {
      // ignore
    }
  }

  toggleDownloader() {
    this.downloaderExpanded = !this.downloaderExpanded;
    this._saveExpandedState();
  }

  render() {
    return renderModelDownloader(this);
  }
}

customElements.define('model-downloader', ModelDownloader);
