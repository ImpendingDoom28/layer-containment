import { trait } from "koota";

export type TInputDirection = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

export const InputDirection = trait(() => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false,
}));
