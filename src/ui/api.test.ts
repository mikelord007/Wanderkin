import { describe, expect, it } from "vitest";
import { ApiError, describeApiError } from "./api.js";

describe("describeApiError", () => {
  it("uses the ApiError message for a failed request", () => {
    const error = new ApiError("Photo upload failed.", 400, null);
    expect(describeApiError(error)).toBe("Photo upload failed.");
  });

  it("falls back to a generic message for unknown throwables", () => {
    expect(describeApiError("boom")).toBe("Something went wrong. Please try again.");
    expect(describeApiError(null)).toBe("Something went wrong. Please try again.");
  });

  it("uses a plain Error's message", () => {
    expect(describeApiError(new Error("network down"))).toBe("network down");
  });
});
