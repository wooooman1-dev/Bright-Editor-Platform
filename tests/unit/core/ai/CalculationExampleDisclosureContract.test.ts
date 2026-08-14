import { describe, expect, it } from "vitest";

import { withCalculationExampleDisclosureContract } from "../../../../core/ai";
import {
  calculationDisclosureContract,
  classifyFactualSurface,
  satisfiesCalculationDisclosure,
} from "../../../../core/approval";

describe("Calculation-example disclosure contract", () => {
  it("asks for all three clauses the exemption requires", () => {
    const instruction = withCalculationExampleDisclosureContract("base");
    expect(instruction.startsWith("base")).toBe(true);
    for (const clause of calculationDisclosureContract.clauses) {
      expect(instruction).toContain(clause);
    }
  });

  /**
   * The instruction and the classifier have to describe the same sentence. If
   * the model sentence the prompt hands the writer does not itself satisfy the
   * exemption, an article that copies it exactly still loses its figures.
   */
  it("hands the writer a model sentence that actually earns the exemption", () => {
    expect(satisfiesCalculationDisclosure(calculationDisclosureContract.example)).toBe(true);
    expect(withCalculationExampleDisclosureContract("base"))
      .toContain(calculationDisclosureContract.example);
  });

  /**
   * The live generation that motivated this contract stopped after the second
   * clause and its comparison table was recorded as eleven unsourced claims.
   */
  it("does not exempt the half-disclosure a live generation actually wrote", () => {
    const halfDisclosure = "아래 표는 대출원금 1억원, 연 4.8%, 3년, 매월 납부라는 동일한 가정을 둔 계산 예시입니다.";
    expect(satisfiesCalculationDisclosure(halfDisclosure)).toBe(false);
    expect(classifyFactualSurface("약 757만원", { sectionDisclosesAssumptions: false }))
      .toBe("unattributed_value");
    expect(classifyFactualSurface("약 757만원", { sectionDisclosesAssumptions: true }))
      .toBe("illustrative");
  });

  it("does not claim the disclosure applies to verified Claim values", () => {
    expect(withCalculationExampleDisclosureContract("base"))
      .toContain("Do not attach this disclosure to figures that came from a verified Claim value");
  });
});
