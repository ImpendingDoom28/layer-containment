import type { ReactNode } from "react";

import { UITypography } from "../../ui/UITypography";

type EditorFieldProps = {
  label: string;
  children: ReactNode;
  description?: string;
};

export const EditorField = ({ label, description, children }: EditorFieldProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <UITypography variant="medium">{label}</UITypography>
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
