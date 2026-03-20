import { UITypography } from "../../ui/UITypography";

type EditorEmptyStateProps = {
  message: string;
};

export const EditorEmptyState = ({ message }: EditorEmptyStateProps) => {
  return (
    <UITypography variant="small" className="text-muted-foreground">
      {message}
    </UITypography>
  );
};
