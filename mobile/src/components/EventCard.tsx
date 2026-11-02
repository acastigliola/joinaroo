import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { EventItem } from '../types';
import { costLabel, formatDistance, formatTime } from '../utils/format';
import { livePillExpiresMs } from '../utils/sections';

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function timeOfDay(iso: string): DayPart {
  const h = new Date(iso).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

export const DAY_PART_STYLE: Record<
  DayPart,
  { label: string; bar: string; text: string; bg: string }
> = {
  morning: { label: 'Morning', bar: '#FFB300', text: '#B27D00', bg: '#FFFDF4' },
  afternoon: { label: 'Afternoon', bar: '#42A5F5', text: '#1565C0', bg: '#F6FBFF' },
  evening: { label: 'Evening', bar: '#1B3A6B', text: '#1B3A6B', bg: '#F4F6FB' },
};

/** Per-category chip colors (sampled from mockup). */
const CATEGORY_CHIP: Record<string, { bg: string; text: string }> = {
  'hack-build': { bg: '#DEEAFC', text: '#2C3C63' },
  'family-fun': { bg: '#EBE6FA', text: '#3F496D' },
  seasonal: { bg: '#F9EEC9', text: '#6E5A29' },
  learn: { bg: '#DEEAFC', text: '#2C3C63' },
  'on-stage': { bg: '#D7E7FC', text: '#2C3C63' },
  'after-dark': { bg: '#F9E0E8', text: '#6B2A3A' },
  'bar-brain': { bg: '#D8F0ED', text: '#2A5A55' },
  'game-on': { bg: '#DFF0E0', text: '#2D5A2D' },
  'taste-maine': { bg: '#FDE8D8', text: '#7A4A1A' },
  'town-square': { bg: '#EBE6FA', text: '#3F496D' },
  'game-day': { bg: '#F9D8D8', text: '#6B1A1A' },
  gallery: { bg: '#FDF3D0', text: '#6B5A1A' },
  'gallery-craft': { bg: '#FDF3D0', text: '#6B5A1A' },
};

function formatDatePart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

interface Props {
  event: EventItem;
  onPress: () => void;
  /** Shown in place of the date, e.g. "Today" or "Friday". */
  dayLabel?: string;
  saved?: boolean;
  onToggleSave?: () => void;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function EventCard({ event, onPress, dayLabel, saved, onToggleSave }: Props) {
  const navigation = useNavigation<any>();
  const distance = formatDistance(event.distance_km);
  const dp = DAY_PART_STYLE[timeOfDay(event.starts_at)];
  const when = dayLabel
    ? `${dayLabel} · ${formatTime(event.starts_at)}`
    : `${formatDatePart(event.starts_at)} · ${formatTime(event.starts_at)}`;
  const catSlug = event.category.slug.replace(/_/g, '-');
  const chipColors = CATEGORY_CHIP[catSlug] ?? { bg: '#E3EDFC', text: '#2C3C63' };
  // Live card: credited photos from people at the event.
  const livePeople = event.live_people ?? [];
  const isLive = livePeople.length > 0;
  // The LIVE pill comes off one hour after the event ends; with no end
  // time it comes off at midnight ending the listing day.
  const showLivePill = isLive && Date.now() < livePillExpiresMs(event);
  const shownPeople = livePeople.slice(0, 5);
  const extraPeople = livePeople.length - shownPeople.length;
  const costEl = (
    <>
      {event.cost_free ? (
        <View style={styles.freeChip}>
          <Text style={styles.freeChipText}>Free</Text>
        </View>
      ) : (
        <Text style={styles.cost}>{costLabel(event)}</Text>
      )}
    </>
  );
  // Sold-out pill (Angelo, Oct 29, from his mockup; web parity). The
  // native standard card renders no photo outside the live variant, so
  // there is no ribbon here — the pill carries the treatment.
  const soldOutPill =
    event.sold_out && !isLive ? (
      <View style={styles.soldOutPill}>
        <Image
          source={require('../../assets/icons/soldout-ticket.png')}
          style={styles.soldOutIcon}
        />
        <Text style={styles.soldOutText}>SOLD OUT</Text>
      </View>
    ) : null;
  // Community Pick chip (Angelo, Oct 29, his supplied graphic; web
  // parity): a wide pill under the chips row on watchlist-band cards.
  const communityPickEl =
    event.community_pick && !isLive ? (
      <Image
        source={require('../../assets/icons/community-pick.png')}
        style={styles.communityPick}
        resizeMode="contain"
      />
    ) : null;
  // Live-score line (Angelo, Oct 27): a tracked game in progress or
  // finished shows its score on the card — parity with web.
  const sc = event.live_score;
  const scoreEl =
    sc && sc.status !== 'scheduled' && sc.home_score != null && sc.away_score != null ? (
      <View style={styles.scoreRow}>
        {sc.status === 'live' ? (
          <Text style={styles.scoreLive}>
            <View style={styles.liveDot} /> LIVE
          </Text>
        ) : (
          <Text style={styles.scoreFinal}>FINAL</Text>
        )}
        <Text style={styles.scoreText}>
          {sc.home_team} {sc.home_score} · {sc.away_team} {sc.away_score}
          {sc.status === 'live' && sc.period ? ` · ${sc.period}` : ''}
        </Text>
      </View>
    ) : null;
  const titleBlock = (
    <>
      <Text style={styles.title} numberOfLines={isLive ? 3 : undefined}>{event.title}</Text>
      <Text style={styles.dayPart}>{when}</Text>
      <View style={styles.metaRow}>
        <Image
          source={require('../../assets/icons/icon-pin-gray.png')}
          style={styles.pin}
        />
        <Text style={styles.meta}>
          {event.venue.name} · {event.venue.city}
        </Text>
      </View>
    </>
  );
  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: dp.bg, borderLeftWidth: 4, borderLeftColor: dp.bar },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        <View style={[styles.chip, { backgroundColor: chipColors.bg }]}>
          <Text style={[styles.chipText, { color: chipColors.text }]}>{event.category.name}</Text>
        </View>
        {event.featured ? (
          <View style={[styles.chip, styles.featuredChip]}>
            <Text style={[styles.chipText, styles.featuredChipText]}>Featured</Text>
          </View>
        ) : null}
        {distance ? (
          <View style={styles.distance}>
            <Text style={styles.distanceText}>{distance}</Text>
          </View>
        ) : null}
      </View>
      {communityPickEl}
      {isLive ? (
        <>
          <View style={styles.liveMain}>
            <View style={styles.liveBody}>{titleBlock}</View>
            {event.live_photo_url ? (
              <View style={styles.liveThumbWrap}>
                <Image source={{ uri: event.live_photo_url }} style={styles.liveThumb} />
                {showLivePill ? (
                  <Image
                    source={require('../../assets/icons/icon-live.png')}
                    style={styles.livePillImg}
                    resizeMode="contain"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
          {costEl}
          {showLivePill ? (
            <View style={styles.liveRow}>
              <View style={styles.liveAvatars}>
                {shownPeople.map((p, i) =>
                  p.avatar_url ? (
                    <Image
                      key={i}
                      source={{ uri: p.avatar_url }}
                      style={[styles.liveAvatar, i === 0 && styles.liveAvatarFirst]}
                    />
                  ) : (
                    <View
                      key={i}
                      style={[styles.liveAvatar, styles.liveAvatarInitials, i === 0 && styles.liveAvatarFirst]}
                    >
                      <Text style={styles.liveAvatarInitialsText}>{initialsOf(p.name)}</Text>
                    </View>
                  ),
                )}
                {extraPeople > 0 ? (
                  <View style={[styles.liveAvatar, styles.liveMore]}>
                    <Text style={styles.liveAvatarInitialsText}>+{extraPeople}</Text>
                  </View>
                ) : null}
              </View>
              <View>
                <View style={styles.liveCountRow}>
                  <Text style={styles.liveCountNum}>{livePeople.length}</Text>
                  <Text style={[styles.liveCount, styles.liveWords]}>
                    {livePeople.length === 1 ? 'person' : 'people'} here now
                  </Text>
                </View>
                <View style={styles.liveSubRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveSub}>Checked in live</Text>
                </View>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.endedPanel,
                livePeople.length > 3 && styles.endedPanelStacked,
              ]}
            >
              <View style={styles.endedAvatars}>
                {shownPeople.map((p, i) => (
                  <View key={i} style={[styles.endedAvatarWrap, i === 0 && styles.endedAvatarFirst]}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.endedAvatar} />
                    ) : (
                      <View style={[styles.endedAvatar, styles.endedAvatarInitials]}>
                        <Text style={styles.endedAvatarInitialsText}>{initialsOf(p.name)}</Text>
                      </View>
                    )}
                    <Image
                      source={require('../../assets/icons/icon-check-green.png')}
                      style={styles.endedBadge}
                      resizeMode="contain"
                    />
                  </View>
                ))}
                {extraPeople > 0 ? (
                  <View style={styles.endedAvatarWrap}>
                    <View style={[styles.endedAvatar, styles.endedAvatarInitials]}>
                      <Text style={styles.endedAvatarInitialsText}>+{extraPeople}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <View style={styles.endedMain}>
                <View style={styles.endedText}>
                  <Text style={styles.endedCount}>
                    {livePeople.length} {livePeople.length === 1 ? 'person' : 'people'} attended
                  </Text>
                  <Text style={styles.endedSub}>Checked in · Attendance confirmed</Text>
                </View>
                <TouchableOpacity
                  style={styles.endedActions}
                  onPress={() =>
                    navigation.push('EventDetail', {
                      slug: event.slug,
                      scrollToPhotos: true,
                    })
                  }
                >
                  <Text style={styles.endedView}>
                    View photos ({event.photo_count ?? 0}) →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      ) : (
        titleBlock
      )}
      {!isLive && soldOutPill}
      {!isLive && costEl}
      {!isLive && scoreEl}
      {onToggleSave ? (
        <TouchableOpacity
          style={styles.starBtn}
          onPress={onToggleSave}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={saved ? 'Remove from saves' : 'Save this event'}
        >
          <Text style={[styles.star, saved && styles.starSaved]}>{saved ? '★' : '☆'}</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  soldOutPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEDCDB', borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start',
  },
  soldOutIcon: { width: 26, height: 24, resizeMode: 'contain' },
  soldOutText: { color: '#8A0203', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  communityPick: { width: 156, maxWidth: '100%', aspectRatio: 1748 / 360, height: undefined, marginTop: 6, marginBottom: 2, alignSelf: 'flex-start' },
  starBtn: { position: 'absolute', right: 10, bottom: 10, padding: 4 },
  star: { fontSize: 24, color: '#9AA3B2' },
  starSaved: { color: '#FFB300' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' },
  chip: {
    backgroundColor: '#E3EDFC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  chipText: { color: '#2C3C63', fontSize: 12, fontWeight: '600' },
  featuredChip: { backgroundColor: '#FBEEC7' },
  featuredChipText: { color: '#6E5A29' },
  recurrenceChip: { backgroundColor: '#E8F0FE' },
  recurrenceChipText: { color: '#1A56DB' },
  distance: { marginLeft: 'auto', marginBottom: 4 },
  distanceText: { color: '#2E7D32', fontSize: 12, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 4 },
  dayPart: { fontSize: 13, fontWeight: '700', marginBottom: 2, color: '#2C5AA0' },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  pin: { width: 14, height: 14, marginRight: 5, marginTop: 2 },
  meta: { fontSize: 13, color: '#7E838D', flex: 1 },
  cost: { fontSize: 13, color: '#2C5AA0', fontWeight: '600', marginTop: 4 },
  freeChip: {
    backgroundColor: '#E3EDFC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  freeChipText: { color: '#2C3C63', fontSize: 12, fontWeight: '600' },
  liveMain: { flexDirection: 'row', gap: 12 },
  liveBody: { flex: 1, minWidth: 0 },
  liveThumbWrap: { position: 'relative' },
  liveThumb: { width: 92, height: 92, borderRadius: 12 },
  livePillImg: { position: 'absolute', top: 6, left: 6, height: 22, width: 63 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  liveAvatars: { flexDirection: 'row', alignItems: 'center' },
  liveAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
    marginLeft: -8,
    backgroundColor: '#DFE5EE',
  },
  liveAvatarFirst: { marginLeft: 0 },
  liveAvatarInitials: { alignItems: 'center', justifyContent: 'center' },
  liveAvatarInitialsText: { fontSize: 12, fontWeight: '700', color: '#2C3C63' },
  liveMore: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F6' },
  liveCount: { fontSize: 14, fontWeight: '700', color: '#111' },
  liveCountNum: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1D9E4B',
    transform: [{ translateY: 3 }],
  },
  liveCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  scoreLive: { color: '#C81E1E', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  scoreFinal: { color: '#5B7186', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  scoreText: { fontWeight: '600', fontSize: 13.5, color: '#17202B', flexShrink: 1 },
  liveWords: { flexShrink: 1 },
  liveSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  liveCheck: { width: 13, height: 13 },
  endedPanel: { marginTop: 10, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  endedPanelStacked: { flexDirection: 'column', gap: 8 },
  endedMain: { flex: 1, flexDirection: 'column', minWidth: 0 },
  endedTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  endedAvatars: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  endedAvatarWrap: { position: 'relative', marginLeft: -8 },
  endedAvatarFirst: { marginLeft: 0 },
  endedAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff', backgroundColor: '#dfe5ee' },
  endedAvatarInitials: { alignItems: 'center', justifyContent: 'center' },
  endedAvatarInitialsText: { color: '#2c3c63', fontWeight: '700', fontSize: 12 },
  endedBadge: { position: 'absolute', right: -2, bottom: -2, width: 14, height: 14 },
  endedText: { flexShrink: 1, gap: 2 },
  endedCount: { fontSize: 17, fontWeight: '700', color: '#14232E' },
  endedSub: { fontSize: 14, color: '#5B7186' },
  endedActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: 12 },
  endedView: { color: '#2C5AA0', fontSize: 16, fontWeight: '600' },
  endedMsg: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderColor: '#2C5AA0', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 16, backgroundColor: '#fff' },
  endedMsgIcon: { width: 19, height: 19 },
  endedMsgText: { color: '#2C5AA0', fontSize: 16, fontWeight: '600' },
  liveSub: { fontSize: 12.5, color: '#7E838D' },
});
