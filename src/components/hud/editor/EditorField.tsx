import type { ReactNode } from "react";

import { UITypography } from "../../ui/UITypography";

type EditorFieldProps = {
  label: string;
  children: ReactNode;
  description?: string;
  /** When set, the label is rendered as a `<label htmlFor>` bound to the control. */
  htmlFor?: string;
};

export const EditorField = ({
  label,
  description,
  children,
  htmlFor,
}: EditorFieldProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <UITypography
          variant="medium"
          as={htmlFor ? "label" : undefined}
          htmlFor={htmlFor}
        >
          {label}
        </UITypography>
        {description ? (
          <UITypography variant="verySmall" className="text-muted-foreground">
            {description}
          </UITypography>
        ) : null}
      </div>
      {children}
    </div>
  );
};
