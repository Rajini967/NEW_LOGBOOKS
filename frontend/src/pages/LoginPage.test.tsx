import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "./LoginPage";

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getEmailInput() {
    return screen.getByRole("textbox", { name: /email/i });
  }

  function getPasswordInput() {
    return screen.getByPlaceholderText("••••••••");
  }

  function getSubmitButton() {
    return screen.getByRole("button", { name: /sign in/i });
  }

  describe("Invalid email & invalid password", () => {
    it("shows invalid credentials message when login rejects", async () => {
      mockLogin.mockRejectedValue({
        response: { data: { error: "Invalid credentials. Please check your email and password." } },
      });
      render(<LoginPage />);
      fireEvent.change(getEmailInput(), { target: { value: "wrong@example.com" } });
      fireEvent.change(getPasswordInput(), { target: { value: "WrongPass" } });
      fireEvent.click(getSubmitButton());
      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials. Please check your email and password./i)).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Invalid email & blank password", () => {
    it("shows please enter your password and does not call login", async () => {
      render(<LoginPage />);
      fireEvent.change(getEmailInput(), { target: { value: "wrong@example.com" } });
      fireEvent.click(getSubmitButton());
      expect(screen.getByText(/Please enter your password./i)).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe("Valid email & blank password", () => {
    it("shows please enter your password and does not call login", async () => {
      render(<LoginPage />);
      fireEvent.change(getEmailInput(), { target: { value: "user@example.com" } });
      fireEvent.click(getSubmitButton());
      expect(screen.getByText(/Please enter your password./i)).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe("Valid email & invalid password", () => {
    it("shows invalid credentials when login rejects", async () => {
      mockLogin.mockRejectedValue({
        response: { data: { error: "Invalid credentials. Please check your email and password." } },
      });
      render(<LoginPage />);
      fireEvent.change(getEmailInput(), { target: { value: "user@example.com" } });
      fireEvent.change(getPasswordInput(), { target: { value: "WrongPass" } });
      fireEvent.click(getSubmitButton());
      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials. Please check your email and password./i)).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("shows API error message when login throws with response data", async () => {
      mockLogin.mockRejectedValue({
        response: { data: { error: "Invalid credentials. Please check your email and password." } },
      });
      render(<LoginPage />);
      fireEvent.change(getEmailInput(), { target: { value: "user@example.com" } });
      fireEvent.change(getPasswordInput(), { target: { value: "WrongPass" } });
      fireEvent.click(getSubmitButton());
      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials. Please check your email and password./i)).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Invalid email & valid password", () => {
    it("shows invalid credentials when login rejects", async () => {
      mockLogin.mockRejectedValue({
        response: { data: { error: "Invalid credentials. Please check your email and password." } },
      });
      render(<LoginPage />);
      fireEvent.change(getEmailInput(), { target: { value: "wrong@example.com" } });
      fireEvent.change(getPasswordInput(), { target: { value: "ValidPass123" } });
      fireEvent.click(getSubmitButton());
      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials. Please check your email and password./i)).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Valid email & valid password", () => {
    it("calls navigate to dashboard and shows no error when login succeeds", async () => {
      mockLogin.mockResolvedValue(true);
      render(<LoginPage />);
      fireEvent.change(getEmailInput(), { target: { value: "user@example.com" } });
      fireEvent.change(getPasswordInput(), { target: { value: "ValidPass123" } });
      fireEvent.click(getSubmitButton());
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith("user@example.com", "ValidPass123");
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
      });
      expect(screen.queryByText(/Invalid credentials/i)).not.toBeInTheDocument();
    });
  });

  describe("Blank email", () => {
    it("shows please enter your email and does not call login", () => {
      render(<LoginPage />);
      fireEvent.change(getPasswordInput(), { target: { value: "SomePass123" } });
      fireEvent.click(getSubmitButton());
      expect(screen.getByText(/Please enter your email./i)).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe("Password masking", () => {
    it("password input has type password by default", () => {
      render(<LoginPage />);
      const passwordInput = getPasswordInput();
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("password input toggles to text when show password is clicked", async () => {
      render(<LoginPage />);
      const passwordInput = getPasswordInput();
      expect(passwordInput).toHaveAttribute("type", "password");
      const toggleButton = screen.getByRole("button", { name: /show password/i });
      fireEvent.click(toggleButton);
      await waitFor(() => {
        expect(passwordInput).toHaveAttribute("type", "text");
      });
    });
  });
});
