
export function handleRoute(ctx) {
  const hash = window.location.hash || '#/server';
  ctx.currentRoute = hash;
}
