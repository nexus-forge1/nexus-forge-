import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewPage } from "../src/routes/index";
import { WorkflowPage } from "../src/routes/workflow";

const { activeMission } = vi.hoisted(() => ({
  activeMission: {
    missionId: "mission_test",
    mission: {
      title: "QA test mission",
      mission: "Create and verify a small demo artifact",
      status: "running",
      approved: true,
      budget: 0,
    },
    agents: [{ status: "complete" }],
    research: [{ _id: "research_test", citations: ["https://example.com/source"] }],
    artifacts: [{ status: "ready" }],
    deliveries: [{ stage: "verified", status: "Production deployment verified", approved: true, workflowConclusion: "success", workflowRunUrl: "https://github.com/example/repo/actions/runs/123", workflowCommitSha: "a".repeat(40), workflowRecordedAt: 1, deploymentRunUrl: "https://github.com/example/repo/actions/runs/123", deploymentCommitSha: "a".repeat(40), deploymentUrl: "https://example.com", readinessStatus: "pass", readinessPassedCount: 6, readinessTotalCount: 6 }],
    measurements: [] as Array<{ metric: string; status: string; verificationId: string; actual: number; target: number }>,
    councilComplete: true,
  },
}));

vi.mock("../src/hooks/use-active-mission", () => ({
  useActiveMission: () => activeMission,
}));

vi.mock("../src/components/workspace-layout", () => ({
  WorkspaceLayout: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main><h1>{title}</h1>{children}</main>
  ),
}));

vi.mock("../src/components/mission-control", () => ({
  MissionControl: () => <div>Mock mission execution and outcome controls</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

describe("isolated end-to-end workflow journey", () => {
  it("shows all sixteen pages without treating missing evidence as complete", () => {
    render(<OverviewPage />);

    expect(screen.getByRole("heading", { name: "QA test mission" })).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
    expect(screen.getByText("6/16")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue next action →" })).toHaveAttribute("href", "/workflow");
    expect(screen.getAllByText(/On this page, use Outcome Verification/).length).toBeGreaterThan(0);
  });

  it("renders the ordered workflow with every stage complete only with verified deployment evidence", () => {
    render(<WorkflowPage />);

    expect(screen.getByRole("heading", { name: "Guided Workflow & Feature Guide" })).toBeInTheDocument();
    expect(screen.getByText("8/9 RECORDED")).toBeInTheDocument();
    expect(screen.getByText("Define mission")).toBeInTheDocument();
    expect(screen.getAllByText("Verify delivery provenance and readiness").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Measure outcome and capture learning").length).toBeGreaterThan(0);
    expect(screen.getByText("Mock mission execution and outcome controls")).toBeInTheDocument();
    expect(screen.getAllByText("Manifest Intelligence").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Expected output:/).length).toBeGreaterThan(0);
    expect(screen.getByText("FULL FEATURE GUIDE · IN ORDER")).toBeInTheDocument();
    expect(screen.getByText("16 PAGES")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next: Mission Console/ })).toHaveAttribute("href", "/mission");
    expect(screen.getByRole("link", { name: /Next: Master Roadmap/ })).toHaveAttribute("href", "/roadmap");
    expect(screen.getByRole("link", { name: /View build roadmap/ })).toHaveAttribute("href", "/roadmap");
  });

  it("completes the outcome checkpoint only after a persisted delivery measurement", () => {
    activeMission.measurements = [{ metric: "actual runtime cost", status: "pass", verificationId: "v1", actual: 1, target: 1 }];
    const view = render(<WorkflowPage />);
    expect(screen.getByText("8/9 RECORDED")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue mission sequence/ })).toHaveAttribute("href", "/workflow");
    activeMission.measurements = [{ metric: "governed delivery readiness", status: "pass", verificationId: "v1", actual: 1, target: 1 }];
    view.rerender(<WorkflowPage />);
    expect(screen.getByText("9/9 RECORDED")).toBeInTheDocument();
    activeMission.measurements = [];
  });

  it("routes Overview and Workflow to recovery for a newer blocked delivery", () => {
    const previous = activeMission.deliveries;
    activeMission.deliveries = [{ ...previous[0], stage: "blocked", status: "Execution blocked: branch missing", workflowRunUrl: "", deploymentRunUrl: "" }, ...previous];
    const view = render(<OverviewPage />);
    expect(screen.getAllByRole("heading", { name: "Resolve blocked delivery" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Continue next action →" })).toHaveAttribute("href", "/delivery");
    expect(screen.getByRole("link", { name: "Open stage →" })).toHaveAttribute("href", "/delivery");
    view.unmount();
    render(<WorkflowPage />);
    expect(screen.getByRole("link", { name: /Continue mission sequence/ })).toHaveAttribute("href", "/delivery");
    expect(screen.getByText("Resolve blocked delivery")).toBeInTheDocument();
    activeMission.deliveries = previous;
  });

  it("does not mark a build/test-only delivery as production verified", () => {
    activeMission.deliveries = [{ stage: "test", status: "GitHub Actions build and test completed", approved: true, workflowConclusion: "success", workflowRunUrl: "https://github.com/example/repo/actions/runs/123", workflowCommitSha: "a".repeat(40), workflowRecordedAt: 1, deploymentRunUrl: "", deploymentCommitSha: "", deploymentUrl: "", readinessStatus: "fail", readinessPassedCount: 0, readinessTotalCount: 6 }];
    render(<WorkflowPage />);
    expect(screen.getByText("7/9 RECORDED")).toBeInTheDocument();
    expect(screen.getAllByText("Verify delivery provenance and readiness").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Continue mission sequence/ })).toHaveAttribute("href", "/delivery");
  });
});
