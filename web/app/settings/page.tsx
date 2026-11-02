import MobileTabs from '../../components/mobile/MobileTabs';
import ProfileSettings from '../../components/ProfileSettings';

/** Settings tab replica — mirrors the mobile app's Settings screen. */
export default function SettingsPage() {
  return (
    <div className="m-app">
      <ProfileSettings />
      <MobileTabs active="settings" qs="" />
    </div>
  );
}
