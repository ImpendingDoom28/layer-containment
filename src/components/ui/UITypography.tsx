import type { FC, ReactNode } from "react";

import React, { useMemo } from "react";
import { cva } from "class-variance-authority";

import { cn } from "./lib/twUtils";

const typographyVariants = cva(
  "focus-visible:ring-1 aria-invalid:ring-1 transition-all disabled:pointer-events-none disabled:opacity-50 shrink-0 outline-none group/typography",
  {
    variants: {
      variant: {
        h1: "text-4xl font-bold",
        h2: "text-3xl font-bold",
        h3: "text-2xl font-bold",
        h4: "text-xl font-bold",
        subHeadline: "text-lg font-bold",
        body: "text-base font-normal",
        medium: "text-sm font-medium",
        small: "text-xs font-normal",
        verySmall: "text-2xs font-normal",
        buttons1: "text-xs font-medium",
        buttons2: "text-xs font-medium",
        buttons3: "text-xs font-medium",
      },
      whiteSpace: {
        nowrap: "whitespace-nowrap",
        normal: "whitespace-normal",
      },
    },
    defaultVariants: {
      variant: "body",
      whiteSpace: "normal",
    },
  }
);

type UITypographyVariant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "subHeadline"
  | "body"
  | "medium"
  | "small"
  | "verySmall"
  | "buttons1"
  | "buttons2"
  | "buttons3";

export type UITypographyProps = {
  children: ReactNode;
  variant?: UITypographyVariant;
  className?: string;
  whiteSpace?: "nowrap" | "normal";
  /**
   * Use this property if you want to render
   * a specific element of html
   *
   * @example
   *  <UITypography
   *  variant={"h2"}
   *  as={'time'} // will render UITypography as 'time' HTML element
   * >
   *  {"12.06.2022"}
   * </UITypography>
   *
   */
  as?: keyof React.JSX.IntrinsicElements;
} & Record<string, unknown>;

export const UITypography: FC<UITypographyProps> = ({
  children,
  variant = "body",
  as,
  className,
  whiteSpace = "normal",
  ...props
}) => {
  const classNames = cn(typographyVariants({ variant, whiteSpace }), className);

  const renderVariant = useMemo(() => {
    if (as) return as;

    switch (variant) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
        return variant;
      case "subHeadline":
        return "h5";
      case "body":
      case "medium":
      case "small":
        return "p";
      case "verySmall":
      case "buttons1":
      case "buttons2":
      case "buttons3":
        return "span";
      default:
        return "p";
    }
  }, [variant, as]);

  return React.createElement(
    renderVariant,
    {
      ...props,
      className: classNames,
    },
    children
  );
};
