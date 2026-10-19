import type { FC, ComponentProps, ReactNode } from "react";

import { cn } from "./lib/twUtils";
import { UITypography, type UITypographyProps } from "./UITypography";

type UITableProps = ComponentProps<"table"> & {
  /**
   * Optional header row. The first header is left-aligned, the rest are
   * right-aligned (stat-table layout).
   */
  headers?: ReactNode[];
};

/**
 * Reusable table primitive (header row + body). Cell text is always rendered
 * through UITypography; rows/cells are composed with UITableRow /
 * UITableCell.
 */
export const UITable: FC<UITableProps> = ({
  headers,
  className,
  children,
  ...props
}) => {
  return (
    <table
      data-slot="ui-table"
      className={cn("w-full border-collapse text-left", className)}
      {...props}
    >
      {headers && (
        <thead>
          <tr>
            {headers.map((header, index) => (
              <UITableHeaderCell
                key={index}
                align={index === 0 ? "left" : "right"}
              >
                {header}
              </UITableHeaderCell>
            ))}
          </tr>
        </thead>
      )}
      <tbody>{children}</tbody>
    </table>
  );
};

type UITableHeaderCellProps = ComponentProps<"th"> & {
  align?: "left" | "right";
};

export const UITableHeaderCell: FC<UITableHeaderCellProps> = ({
  align = "left",
  className,
  children,
  ...props
}) => {
  return (
    <th
      data-slot="ui-table-header-cell"
      className={cn(
        "py-1",
        align === "left" ? "pr-3" : "px-3 text-right",
        className
      )}
      {...props}
    >
      <UITypography
        variant="medium"
        as="span"
        className="text-muted-foreground"
      >
        {children}
      </UITypography>
    </th>
  );
};

type UITableRowProps = ComponentProps<"tr">;

export const UITableRow: FC<UITableRowProps> = ({
  className,
  ...props
}) => {
  return (
    <tr
      data-slot="ui-table-row"
      className={cn(className)}
      {...props}
    />
  );
};

type UITableCellProps = ComponentProps<"td"> & {
  align?: "left" | "right";
  /** Typography variant for the cell's content. */
  variant?: UITypographyProps["variant"];
  /**
   * Render the content as-is, without the default UITypography wrapper. Use
   * for cells that hold a UI component of their own (e.g. UIMoney, buttons).
   */
  plain?: boolean;
};

/** A table cell; its content is wrapped in UITypography unless `plain`. */
export const UITableCell: FC<UITableCellProps> = ({
  align = "left",
  variant = "medium",
  plain = false,
  className,
  children,
  ...props
}) => {
  return (
    <td
      data-slot="ui-table-cell"
      className={cn(
        "py-1",
        align === "left" ? "pr-3" : "px-3 text-right",
        className
      )}
      {...props}
    >
      {plain ? (
        children
      ) : (
        <UITypography variant={variant} as="span">
          {children}
        </UITypography>
      )}
    </td>
  );
};
