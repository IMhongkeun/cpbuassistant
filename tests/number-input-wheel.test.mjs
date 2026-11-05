import assert from "node:assert/strict"
import test from "node:test"
import { blurFocusedNumberInputOnWheel } from "../lib/number-input-wheel.ts"

test("wheel blurs only the focused number input without preventing page scroll", () => {
  const previousInput = globalThis.HTMLInputElement
  const previousDocument = globalThis.document

  class MockInput {
    constructor(type) {
      this.type = type
      this.blurCount = 0
    }
    blur() {
      this.blurCount += 1
      globalThis.document.activeElement = null
    }
  }

  globalThis.HTMLInputElement = MockInput
  globalThis.document = { activeElement: null }

  try {
    const numberInput = new MockInput("number")
    globalThis.document.activeElement = numberInput
    let defaultPrevented = false
    const wheelEvent = {
      target: numberInput,
      preventDefault() { defaultPrevented = true },
    }

    blurFocusedNumberInputOnWheel(wheelEvent)
    assert.equal(numberInput.blurCount, 1)
    assert.equal(globalThis.document.activeElement, null)
    assert.equal(defaultPrevented, false)

    // Unfocused numeric fields should not lose focus elsewhere.
    const otherInput = new MockInput("number")
    globalThis.document.activeElement = otherInput
    blurFocusedNumberInputOnWheel({ target: numberInput })
    assert.equal(numberInput.blurCount, 1)
    assert.equal(otherInput.blurCount, 0)

    // Normal text inputs and other targets are unaffected.
    const textInput = new MockInput("text")
    globalThis.document.activeElement = textInput
    blurFocusedNumberInputOnWheel({ target: textInput })
    blurFocusedNumberInputOnWheel({ target: {} })
    assert.equal(textInput.blurCount, 0)
  } finally {
    if (previousInput === undefined) delete globalThis.HTMLInputElement
    else globalThis.HTMLInputElement = previousInput
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
