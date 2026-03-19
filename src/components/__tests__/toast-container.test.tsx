import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "@/contexts/toast-context";
import { ToastContainer } from "../toast-container";

function TriggerButton() {
  const { addToast } = useToast();
  return (
    <div>
      <button onClick={() => addToast("Success msg", "success")}>Trigger Success</button>
      <button onClick={() => addToast("Error msg", "error")}>Trigger Error</button>
    </div>
  );
}

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when no toasts", () => {
    const { container } = render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>
    );
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
  });

  it("renders success toast with correct styles", () => {
    render(
      <ToastProvider>
        <TriggerButton />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger Success"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Success msg");
    expect(alert.className).toContain("bg-green-600");
  });

  it("renders error toast with correct styles", () => {
    render(
      <ToastProvider>
        <TriggerButton />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger Error"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Error msg");
    expect(alert.className).toContain("bg-red-600");
  });

  it("dismisses toast on X click", () => {
    render(
      <ToastProvider>
        <TriggerButton />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger Success"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
