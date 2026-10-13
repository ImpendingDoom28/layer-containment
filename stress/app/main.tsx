import React from "react";
import ReactDOM from "react-dom/client";

import "./styles.css";
import { StressTestApp } from "./StressTestApp";

const StressTest = () => {
  return <StressTestApp />;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StressTest />
  </React.StrictMode>
);
