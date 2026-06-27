import { LitElement, html, css } from 'lit';
import { cardStyles } from './_primitives.js';

export class DataTable extends LitElement {
  static properties = {
    columns: { type: Array },
    rows: { type: Array },
    sortKey: { type: String },
    sortDir: { type: String },
    pageSize: { type: Number }
  };

  constructor() {
    super();
    this.columns = [];
    this.rows = [];
    this.sortKey = '';
    this.sortDir = 'asc';
    this.pageSize = 10;
  }

  static styles = css`
    ${cardStyles}

    .table-container {
      overflow-x: auto;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }
    
    th {
      font-weight: 600;
      color: var(--text-secondary);
      position: relative;
      cursor: pointer;
      user-select: none;
    }

    th:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    td {
      color: var(--text-primary);
    }
    
    .sort-indicator {
      margin-left: 4px;
      opacity: 0.6;
    }
    
    .pagination-controls {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 16px;
      align-items: center;
    }

    .page-btn {
      padding: 8px 16px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      cursor: pointer;
    }
    
    .page-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .page-btn[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    
    .pagination-info {
      color: var(--text-secondary);
      font-size: 0.8rem;
    }
  `;

  render() {
    const totalRows = this.rows.length;
    const totalPages = Math.ceil(totalRows / this.pageSize);
    const currentPage = Math.min(Math.floor((this.rows.length - 1) / this.pageSize), totalPages - 1);

    // If no rows, show empty state
    if (!totalRows) {
      return html`
        <div class="card">
          No data available.
        </div>
      `;
    }

    // Calculate visible rows for current page
    const start = currentPage * this.pageSize;
    const end = Math.min(start + this.pageSize, totalRows);
    const visibleRows = this.rows.slice(start, end);

    return html`
      <div class="table-container">
        ${this.columns && this.columns.length > 0 ? html`
          <table>
            <thead>
              <tr>
                ${this.columns.map(col => {
                  const isSorted = col.key === this.sortKey;
                  const sortDirection = isSorted ? (this.sortDir || 'asc') : '';
                  
                  return html`
                    <th 
                      @click="${() => this._handleSort(col.key)}"
                      class="${isSorted ? 'sorted' : ''}"
                    >
                      ${col.label}
                      ${isSorted ? html`<span class="sort-indicator">${sortDirection === 'desc' ? '↓' : '↑'}</span>` : ''}
                    </th>
                  `;
                })}
              </tr>
            </thead>
            <tbody>
              ${visibleRows.map(row => html`
                <tr>
                  ${this.columns.map(col => {
                    const value = row[col.key];
                    return html`<td>${col.render ? col.render(value, row) : value}</td>`;
                  })}
                </tr>
              `)}
            </tbody>
          </table>
        ` : html`
          <p>No columns defined</p>
        `}
      </div>

      ${totalPages > 1 ? html`
        <div class="pagination-controls">
          <button 
            class="page-btn"
            @click="${this._goToFirstPage}"
            ?disabled="${currentPage === 0}">
            First
          </button>
          
          <button 
            class="page-btn"  
            @click="${this._goToPreviousPage}"
            ?disabled="${currentPage === 0}">
            Previous
          </button>
          
          <span class="pagination-info">
            Page ${currentPage + 1} of ${totalPages}
          </span>
          
          <button 
            class="page-btn"
            @click="${this._goToNextPage}"
            ?disabled="${currentPage >= totalPages - 1}">
            Next
          </button>
          
          <button 
            class="page-btn"
            @click="${this._goToLastPage}"
            ?disabled="${currentPage >= totalPages - 1}">
            Last
          </button>
        </div>
      ` : nothing}
    `;
  }

  _handleSort(key) {
    let dir = 'asc';
    
    if (this.sortKey === key && this.sortDir === 'asc') {
      dir = 'desc';
    }
    
    // Dispatch sort change event
    this.dispatchEvent(new CustomEvent('sort-change', {
      detail: { 
        key, 
        dir 
      }
    }));
  }

  _goToFirstPage() {
    this._navigateToPage(0);
  }

  _goToPreviousPage() {
    const currentPage = Math.floor((this.rows.length - 1) / this.pageSize);
    if (currentPage > 0) {
      this._navigateToPage(currentPage - 1);
    }
  }

  _goToNextPage() {
    const currentPage = Math.floor((this.rows.length - 1) / this.pageSize);
    const totalPages = Math.ceil(this.rows.length / this.pageSize);
    
    if (currentPage < totalPages - 1) {
      this._navigateToPage(currentPage + 1);
    }
  }

  _goToLastPage() {
    const totalPages = Math.ceil(this.rows.length / this.pageSize);
    this._navigateToPage(totalPages - 1);
  }

  _navigateToPage(pageNum) {
    // Since we're paginated on the client side, just ensure event is dispatched
    // The parent component handles the actual pagination logic
    this.dispatchEvent(new CustomEvent('page-change', {
      detail: { 
        page: pageNum,
        pageSize: this.pageSize 
      }
    }));
  }

  updated() {
    // Ensure we trigger a sort change when sortKey changes (if needed)
  }
}