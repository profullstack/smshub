import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/contexts/toast-context";

function TestConsumer() {
  const { toasts, addToast, removeToast } = useToast();
  return (
    <div>
      <button onClick={() => addToast("Test success", "success")}>Add Success</button>
      <button onClick={() => addToast("Test error", "error")}>Add Error</button>
      <button onClick={() => addToast("Test info")}>Add Info</button>
      {toasts.map((t) => (
        <div key={t.id} data-testid={`toast-${t.type}`}>
          {t.message}
          <button onClick={() => removeToast(t.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}

describe("ToastContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws if used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useToast must be used within ToastProvider"
    );
    spy.mockRestore();
  });

  it("adds and displays toasts", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Success"));
    expect(screen.getByTestId("toast-success")).toHaveTextContent("Test success");
  });

  it("defaults to info type", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Info"));
    expect(screen.getByTestId("toast-info")).toHaveTextContent("Test info");
  });

  it("removes toast manually", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Success"));
    expect(screen.getByTestId("toast-success")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove"));
    expect(screen.queryByTestId("toast-success")).not.toBeInTheDocument();
  });

  it("auto-removes toast after 4 seconds", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Error"));
    expect(screen.getByTestId("toast-error")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4100);
    });

    expect(screen.queryByTestId("toast-error")).not.toBeInTheDocument();
  });
});
