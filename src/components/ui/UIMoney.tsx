import type { FC } from "react";

import { Icon } from "./Icon";
import { UITypography, type UITypographyProps } from "./UITypography";
import { cn } from "./lib/twUtils";

type UIMoneyProps = {
  money: number;
  variant?: UITypographyProps["variant"];
  iconSize?: number;
  className?: string;
};

export const UIMoney: FC<UIMoneyProps> = ({
  money,
  variant = "medium",
  iconSize,
  className,
}) => {
  const resolvedIconSize = iconSize ?? 16;

  return (
    <UITypography
      variant={variant}
      className={cn("flex items-center text-green-400", className)}
    >
      <Icon name="DollarSign" color="green" size={resolvedIconSize} className="mr-1" />{" "}
      {money}
    </UITypography>
  );
};
