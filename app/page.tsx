import { HomeLayout } from "./home/HomeLayout";
import { sprintThreeHomeState } from "./home/home-state";

export default function Home() {
  return <HomeLayout state={sprintThreeHomeState} />;
}
