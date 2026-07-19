import { FC } from "react";
import { REPOSITORY_URL } from "../../../constants/game";
import { GithubIcon } from "../../ui/assets/GithubIcon";
import { cn } from "../../ui/lib/twUtils";
import { UIButton } from "../../ui/buttons/UIButton";

type GithubButtonProps = {
  hasInteracted: boolean;
};

export const GithubButton: FC<GithubButtonProps> = ({ hasInteracted }) => {
  if (REPOSITORY_URL === "") return null;

  return (
    <UIButton
      variant="ghost"
      size="icon-lg"
      className={cn(
        "pointer-events-auto fixed top-8 right-8 z-[100] border border-transparent text-muted-foreground hover:border-primary/30 hover:text-primary md:right-8 transition-opacity duration-1000",
        hasInteracted ? "opacity-100" : "opacity-0"
      )}
    >
      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source on GitHub"
      >
        <GithubIcon />
      </a>
    </UIButton>
  );
};
