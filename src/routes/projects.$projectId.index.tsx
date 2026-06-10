import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/")({
  component: () => {
    const { projectId } = useParams({ from: "/projects/$projectId/" });
    const navigate = useNavigate();
    // Redirect bare /projects/:id to /projects/:id/overview
    if (typeof window !== "undefined") {
      void navigate({ to: "/projects/$projectId/overview", params: { projectId }, replace: true });
    }
    return null;
  },
});
