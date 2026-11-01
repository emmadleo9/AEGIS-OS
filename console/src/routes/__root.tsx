import { createRootRoute, Outlet } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";

function RootLayout() {
  return <Outlet />;
}

export const Route = createRootRoute({
  validateSearch: (search): { redirect?: string } => ({
    redirect: (search.redirect as string) || undefined,
  }),
  beforeLoad: async ({ search, location }) => {
    if (location.pathname.startsWith("/login")) {
      throw redirect({
        to: search.redirect || "/",
      });
    }
  },
  component: RootLayout,
});
