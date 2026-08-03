import type { BehaviorFeedback } from "../../../../packages/core/types/RuntimeTypes.js";

interface FeedbackTextElement {
  textContent: string | null;
}

interface InternalStatusElement extends FeedbackTextElement {
  hidden: boolean | string;
}

interface FeedbackBubbleElement extends FeedbackTextElement {
  hidden: boolean | string;
  readonly dataset: Record<string, string | undefined>;
}

export interface BehaviorFeedbackElements {
  readonly bubble: FeedbackBubbleElement;
  readonly reason: FeedbackTextElement;
  readonly slot?: FeedbackTextElement;
  readonly source?: FeedbackTextElement;
  readonly trigger?: FeedbackTextElement;
  readonly internalStatus?: InternalStatusElement;
}

export class BehaviorFeedbackPresenter {
  readonly #elements: BehaviorFeedbackElements;

  constructor(elements: BehaviorFeedbackElements) {
    this.#elements = elements;
  }

  render(feedback: BehaviorFeedback | undefined): void {
    const { bubble, reason, slot, source, trigger, internalStatus } = this.#elements;
    if (!feedback) {
      bubble.hidden = true;
      reason.textContent = "";
      if (internalStatus) internalStatus.hidden = false;
      return;
    }
    if (internalStatus) internalStatus.hidden = true;
    reason.textContent = feedback.reason;
    if (slot) slot.textContent = feedback.behaviorSlot;
    if (source) source.textContent = feedback.source;
    if (trigger) trigger.textContent = feedback.triggerName;
    bubble.dataset.level = feedback.level;
    bubble.dataset.mode = feedback.mode;
    bubble.hidden = false;
  }
}
