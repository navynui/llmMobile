import { LitElement } from 'lit';
import { galleryStyles } from './gallery-tab/_styles.js';
import * as logic from './gallery-tab/_logic.js';
import { renderGallery } from './gallery-tab/_templates.js';

export class GalleryTab extends LitElement {
  static properties = {
    images:       { type: Array },
    folders:      { type: Array },
    currentPath:  { type: String },
    page:         { type: Number },
    totalPages:   { type: Number },
    totalImages:  { type: Number },
    loading:      { type: Boolean },
    selected:     { type: Object },   // Set of relative_path strings
    lightbox:     { type: Object },   // { images, index }
    activeActionMenu: { type: Object },
    showMoveModal:    { type: Boolean },
    allFolders:       { type: Array },
    moveTargetGroup:  { type: Object },
  };

  static styles = galleryStyles;

  constructor() {
    super();
    this.images      = [];
    this.folders     = [];
    this.currentPath = '';
    this.page        = 1;
    this.totalPages  = 0;
    this.totalImages = 0;
    this.loading     = false;
    this.selected    = new Set();
    this.lightbox    = null;
    this._longPressTimer = null;
    this._selectMode     = false;
    this.activeActionMenu = null;
    this.showMoveModal    = false;
    this.allFolders       = [];
    this.moveTargetGroup  = null;
  }

  connectedCallback() {
    super.connectedCallback();
    logic.load(this);
  }

  render() {
    return renderGallery(this);
  }
}

customElements.define('gallery-tab', GalleryTab);
