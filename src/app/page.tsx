import { HomeScreen } from '@/ui/home/HomeScreen';
import { homeMetadata } from '@/ui/metadata';

export const metadata = homeMetadata();

export default function HomePage() {
  return <HomeScreen />;
}
