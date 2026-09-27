// Minimal entry for the workers test pool. Tests call handlers directly, so this is never routed to.
export default {
  fetch(): Response {
    return new Response("test worker", { status: 404 });
  },
};
