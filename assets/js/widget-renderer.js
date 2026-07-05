window.eyWidgetRenderer = {
  renderWidget(widget) {
    return `
      <article class="ey-widget" data-widget-type="${widget.type || ""}">
        <div class="ey-widget-icon">${widget.icon || "◇"}</div>
        <div class="ey-widget-title">${widget.title || ""}</div>
        <div class="ey-widget-value" id="${widget.valueId || ""}">${widget.value || ""}</div>
        <div class="ey-widget-detail" id="${widget.detailId || ""}">${widget.detail || ""}</div>
      </article>
    `;
  },

  renderDashboard(targetId, config) {
    const target = document.getElementById(targetId);
    target.innerHTML = config.widgets.map(this.renderWidget).join("");
  }
};
