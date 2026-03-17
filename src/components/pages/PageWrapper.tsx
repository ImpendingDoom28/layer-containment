import { FC, ReactNode } from "react";

type PageWrapperProps = {
  children: ReactNode;
};

export const PageWrapper: FC<PageWrapperProps> = ({ children }) => {
  return (
    <div className="relative w-screen h-screen bg-gray-900">{children}</div>
  );
};
