import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { DriveScreen } from "./src/screens/DriveScreen";

export default function App() {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <>
      <StatusBar hidden />
      {url ? <DriveScreen url={url} onBack={() => setUrl(null)} /> : <ConnectScreen onConnect={setUrl} />}
    </>
  );
}
