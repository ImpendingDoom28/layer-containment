import { FC } from "react";
import { useTranslation } from "react-i18next";

import { HUDWrapper } from "./HUDWrapper";
import { UITypography } from "../ui/UITypography";
import { cn } from "../ui/lib/twUtils";

type HUDLoadingProps = {
  message?: string;
  className?: string;
};

export const HUDLoading: FC<HUDLoadingProps> = ({ message, className }) => {
  const { t } = useTranslation();

  return (
    <HUDWrapper
      className={cn(
        "items-center justify-center bg-gray-900/95 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="border-2 rounded-full size-10 animate-spin border-primary border-t-transparent"
          aria-hidden
        />
        <UITypography variant="body" className="text-muted-foreground">
          {message ?? t("common.loading")}
        </UITypography>
      </div>
    </HUDWrapper>
  );
};
