import { FC } from "react";
import { useTranslation } from "react-i18next";

import { REPOSITORY_URL } from "../../../constants/game";
import { Icon } from "../../ui/Icon";
import { cn } from "../../ui/lib/twUtils";
import { UIButton } from "../../ui/buttons/UIButton";

type GithubButtonProps = {
  hasInteracted: boolean;
};

export const GithubButton: FC<GithubButtonProps> = ({ hasInteracted }) => {
  const { t } = useTranslation();

  if (REPOSITORY_URL === "") return null;

  return (
    <UIButton
      variant="ghost"
      size="icon-lg"
      className={cn(
        "pointer-events-auto fixed top-8 right-8 z-[100] border border-transparent hover:border-primary/30 md:right-8 transition-opacity duration-1000",
        hasInteracted ? "opacity-100" : "opacity-0"
      )}
    >
      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("menu.viewSource")}
        className="relative block"
      >
        {/* <img> icons can't inherit hover text color, so the hover state
            cross-fades between the two pre-colored variants; the in-flow
            variant keeps the anchor sized. */}
        <Icon
          name="Github"
          size={24}
          className="relative transition-opacity group-hover/button:opacity-0"
        />
        <Icon
          name="Github"
          color="primary"
          size={24}
          className="absolute inset-0 opacity-0 transition-opacity group-hover/button:opacity-100"
        />
      </a>
    </UIButton>
  );
};
