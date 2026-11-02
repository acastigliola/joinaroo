import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getEvent, getEventPhotos, getEvents, uploadEventPhoto } from '../api';
import type { EventPhoto } from '../api';
import type { CommunityBlockData, CommunityQuote, EventItem, GameSummary as GameSummaryData, LivePerson, LiveScore } from '../types';
import { useApp } from '../store';
import { useAuth, fetchServerSaves, serverSave, serverUnsave } from '../lib/auth';
import { costLabel, formatDate, formatDistance, formatTime } from '../utils/format';
import { detailsButtonExpiresMs, livePillExpiresMs } from '../utils/sections';
import { DAY_PART_STYLE, timeOfDay } from '../components/EventCard';
import TabBarReplica from '../components/TabBarReplica';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'EventDetail'>;

const SCREEN_W = Dimensions.get('window').width;

/** "Austin Carlton" -> "Austin C." (mockup label for people at an event). */
// Chip labels for the single-word recurrence values (Angelo, Oct 25:
// "Repeats Annually", "Repeats Monthly"); phrase values render verbatim.
const RECURRENCE_LABEL: Record<string, string> = {
  annual: 'Annually',
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  '1st and 3rd Saturdays monthly': '1st & 3rd Saturday Monthly',
  '4th Thursday monthly': '4th Thursday Monthly',
};

// Game-summary module assets (Angelo, Oct 28): the summary JSON carries
// web logo paths; natively the same art is bundled — map by file name.
const GAME_ASSETS: Record<string, number> = {
  'logo-huskies.png': require('../../assets/icons/games/logo-huskies.png'),
  'logo-huskies-profile.png': require('../../assets/icons/games/logo-huskies-profile.png'),
  'logo-panthers.png': require('../../assets/icons/games/logo-panthers.png'),
  'logo-blackbears.png': require('../../assets/icons/games/logo-blackbears.png'),
  'logo-blackbears-profile.png': require('../../assets/icons/games/logo-blackbears-profile.png'),
  'logo-blackbears-profile-left.png': require('../../assets/icons/games/logo-blackbears-profile-left.png'),
  'logo-blackbears-front.png': require('../../assets/icons/games/logo-blackbears-front.png'),
  'logo-catamounts.png': require('../../assets/icons/games/logo-catamounts.png'),
  'logo-tornado.png': require('../../assets/icons/games/logo-tornado.png'),
  'logo-knight.png': require('../../assets/icons/games/logo-knight.png'),
  'logo-noreasters.png': require('../../assets/icons/games/logo-noreasters.png'),
  'logo-oob-seagulls.png': require('../../assets/icons/games/logo-oob-seagulls.png'),
  'logo-oob-seagulls-profile.png': require('../../assets/icons/games/logo-oob-seagulls-profile.png'),
  'logo-oob-seagulls-profile-left.png': require('../../assets/icons/games/logo-oob-seagulls-profile-left.png'),
  'logo-maranacook-bears.png': require('../../assets/icons/games/logo-maranacook-bears.png'),
  'logo-maranacook-bears-profile.png': require('../../assets/icons/games/logo-maranacook-bears-profile.png'),
  'logo-maranacook-bears-profile-left.png': require('../../assets/icons/games/logo-maranacook-bears-profile-left.png'),
  'logo-biddeford-tigers.png': require('../../assets/icons/games/logo-biddeford-tigers.png'),
  'logo-biddeford-tigers-profile.png': require('../../assets/icons/games/logo-biddeford-tigers-profile.png'),
  'logo-biddeford-tigers-profile-left.png': require('../../assets/icons/games/logo-biddeford-tigers-profile-left.png'),
  'logo-cheverus-stags.png': require('../../assets/icons/games/logo-cheverus-stags.png'),
  'logo-cheverus-stags-profile.png': require('../../assets/icons/games/logo-cheverus-stags-profile.png'),
  'logo-cheverus-stags-profile-left.png': require('../../assets/icons/games/logo-cheverus-stags-profile-left.png'),
  'logo-westbrook-blazes.png': require('../../assets/icons/games/logo-westbrook-blazes.png'),
  'logo-westbrook-blazes-profile.png': require('../../assets/icons/games/logo-westbrook-blazes-profile.png'),
  'logo-westbrook-blazes-profile-left.png': require('../../assets/icons/games/logo-westbrook-blazes-profile-left.png'),
  'logo-falmouth-navigators.png': require('../../assets/icons/games/logo-falmouth-navigators.png'),
  'logo-falmouth-navigators-profile.png': require('../../assets/icons/games/logo-falmouth-navigators-profile.png'),
  'logo-falmouth-navigators-profile-left.png': require('../../assets/icons/games/logo-falmouth-navigators-profile-left.png'),
  'logo-endicott-gulls.png': require('../../assets/icons/games/logo-endicott-gulls.png'),
  'logo-endicott-gulls-profile.png': require('../../assets/icons/games/logo-endicott-gulls-profile.png'),
  'logo-endicott-gulls-profile-left.png': require('../../assets/icons/games/logo-endicott-gulls-profile-left.png'),
  'logo-providence-friars.png': require('../../assets/icons/games/logo-providence-friars.png'),
  'logo-providence-friars-profile.png': require('../../assets/icons/games/logo-providence-friars-profile.png'),
  'logo-providence-friars-profile-left.png': require('../../assets/icons/games/logo-providence-friars-profile-left.png'),
  'logo-ta-trojans.png': require('../../assets/icons/games/logo-ta-trojans.png'),
  'logo-ta-trojans-profile.png': require('../../assets/icons/games/logo-ta-trojans-profile.png'),
  'logo-ta-trojans-profile-left.png': require('../../assets/icons/games/logo-ta-trojans-profile-left.png'),
  'logo-massabesic-wildcats.png': require('../../assets/icons/games/logo-massabesic-wildcats.png'),
  'logo-massabesic-wildcats-profile.png': require('../../assets/icons/games/logo-massabesic-wildcats-profile.png'),
  'logo-massabesic-wildcats-profile-left.png': require('../../assets/icons/games/logo-massabesic-wildcats-profile-left.png'),
  'logo-bu-terriers.png': require('../../assets/icons/games/logo-bu-terriers.png'),
  'logo-bu-terriers-profile.png': require('../../assets/icons/games/logo-bu-terriers-profile.png'),
  'logo-bu-terriers-profile-left.png': require('../../assets/icons/games/logo-bu-terriers-profile-left.png'),
  'logo-bowdoin-polarbears.png': require('../../assets/icons/games/logo-bowdoin-polarbears.png'),
  'logo-bowdoin-polarbears-profile.png': require('../../assets/icons/games/logo-bowdoin-polarbears-profile.png'),
  'logo-bowdoin-polarbears-profile-left.png': require('../../assets/icons/games/logo-bowdoin-polarbears-profile-left.png'),
  'logo-wesleyan-cardinals.png': require('../../assets/icons/games/logo-wesleyan-cardinals.png'),
  'logo-wesleyan-cardinals-profile.png': require('../../assets/icons/games/logo-wesleyan-cardinals-profile.png'),
  'logo-wesleyan-cardinals-profile-left.png': require('../../assets/icons/games/logo-wesleyan-cardinals-profile-left.png'),
  'logo-siena-saints.png': require('../../assets/icons/games/logo-siena-saints.png'),
  'logo-siena-saints-profile.png': require('../../assets/icons/games/logo-siena-saints-profile.png'),
  'logo-siena-saints-profile-left.png': require('../../assets/icons/games/logo-siena-saints-profile-left.png'),
  'logo-sacred-heart-pioneers.png': require('../../assets/icons/games/logo-sacred-heart-pioneers.png'),
  'logo-sacred-heart-pioneers-profile.png': require('../../assets/icons/games/logo-sacred-heart-pioneers-profile.png'),
  'logo-sacred-heart-pioneers-profile-left.png': require('../../assets/icons/games/logo-sacred-heart-pioneers-profile-left.png'),
  'logo-umass-minutemen.png': require('../../assets/icons/games/logo-umass-minutemen.png'),
  'logo-umass-minutemen-profile.png': require('../../assets/icons/games/logo-umass-minutemen-profile.png'),
  'logo-umass-minutemen-profile-left.png': require('../../assets/icons/games/logo-umass-minutemen-profile-left.png'),
  'logo-curry-colonels.png': require('../../assets/icons/games/logo-curry-colonels.png'),
  'logo-curry-colonels-profile.png': require('../../assets/icons/games/logo-curry-colonels-profile.png'),
  'logo-curry-colonels-profile-left.png': require('../../assets/icons/games/logo-curry-colonels-profile-left.png'),
  'logo-colby-mules.png': require('../../assets/icons/games/logo-colby-mules.png'),
  'logo-colby-mules-profile.png': require('../../assets/icons/games/logo-colby-mules-profile.png'),
  'logo-colby-mules-profile-left.png': require('../../assets/icons/games/logo-colby-mules-profile-left.png'),
  'logo-tufts-jumbos.png': require('../../assets/icons/games/logo-tufts-jumbos.png'),
  'logo-tufts-jumbos-profile.png': require('../../assets/icons/games/logo-tufts-jumbos-profile.png'),
  'logo-tufts-jumbos-profile-left.png': require('../../assets/icons/games/logo-tufts-jumbos-profile-left.png'),
  'logo-bates-bobcats.png': require('../../assets/icons/games/logo-bates-bobcats.png'),
  'logo-bates-bobcats-profile.png': require('../../assets/icons/games/logo-bates-bobcats-profile.png'),
  'logo-bates-bobcats-profile-left.png': require('../../assets/icons/games/logo-bates-bobcats-profile-left.png'),
  'logo-sacramento-state-hornets.png': require('../../assets/icons/games/logo-sacramento-state-hornets.png'),
  'logo-sacramento-state-hornets-profile.png': require('../../assets/icons/games/logo-sacramento-state-hornets-profile.png'),
  'logo-sacramento-state-hornets-profile-left.png': require('../../assets/icons/games/logo-sacramento-state-hornets-profile-left.png'),
  'logo-sp-redriots.png': require('../../assets/icons/games/logo-sp-redriots.png'),
  'logo-sp-redriots-profile.png': require('../../assets/icons/games/logo-sp-redriots-profile.png'),
  'logo-sp-redriots-profile-left.png': require('../../assets/icons/games/logo-sp-redriots-profile-left.png'),
  'logo-portland-bulldogs.png': require('../../assets/icons/games/logo-portland-bulldogs.png'),
  'logo-portland-bulldogs-profile.png': require('../../assets/icons/games/logo-portland-bulldogs-profile.png'),
  'logo-portland-bulldogs-profile-left.png': require('../../assets/icons/games/logo-portland-bulldogs-profile-left.png'),
  'trophy-blue.png': require('../../assets/icons/games/trophy-blue.png'),
  'bracket-blue.png': require('../../assets/icons/games/bracket-blue.png'),
};
function gameAsset(path?: string | null): number | null {
  if (!path) return null;
  const base = path.split('/').pop() ?? '';
  return GAME_ASSETS[base] ?? null;
}

/** Game-summary module (Angelo, Oct 28, from his mockup; native parity
 * with web GameSummary): logo-vs-logo score header with a FINAL/LIVE
 * pill, records strip, note panel, what's-next panel — rendered above
 * the facts when the event carries game_summary data. */
function GameSummaryView({
  score,
  summary,
  startsAt,
}: {
  score: LiveScore;
  summary: GameSummaryData;
  startsAt: string;
}) {
  const live = score.status === 'live';
  const dateLabel = new Date(startsAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
  const { home, away } = summary;
  const homeLogo = gameAsset(home.logo);
  const awayLogo = gameAsset(away.logo);
  const recLogo = gameAsset(summary.records_logo);
  return (
    <View style={styles.gsModule}>
      <View style={styles.gsPanel}>
        <View style={styles.gsHead}>
          {homeLogo ? (
            <Image source={homeLogo} style={styles.gsLogo} resizeMode="contain" />
          ) : (
            <View style={styles.gsLogo} />
          )}
          <Text style={styles.gsScore}>{score.home_score}</Text>
          <View style={styles.gsMid}>
            <View style={live ? styles.gsPillLive : styles.gsPill}>
              <Text style={styles.gsPillText}>
                {live
                  ? `● LIVE${score.period ? ` · ${score.period}` : ''}`
                  : 'FINAL'}
              </Text>
            </View>
            <Text style={styles.gsDate}>{dateLabel}</Text>
          </View>
          <Text style={styles.gsScore}>{score.away_score}</Text>
          {awayLogo ? (
            <Image source={awayLogo} style={styles.gsLogo} resizeMode="contain" />
          ) : (
            <View style={styles.gsLogo} />
          )}
        </View>
        <View style={styles.gsNames}>
          <View style={styles.gsTeam}>
            <Text style={styles.gsTeamName}>{home.name}</Text>
            {home.mascot ? <Text style={styles.gsTeamMascot}>{home.mascot}</Text> : null}
          </View>
          <View style={[styles.gsTeam, styles.gsTeamRight]}>
            <Text style={styles.gsTeamName}>{away.name}</Text>
            {away.mascot ? <Text style={styles.gsTeamMascot}>{away.mascot}</Text> : null}
          </View>
        </View>
      </View>

      {summary.records && summary.records.length > 0 ? (
        <View
          style={[
            styles.gsPanel,
            styles.gsRecordsPanel,
            recLogo ? styles.gsRecordsWithLogo : null,
          ]}
        >
          {summary.records.map((r, i) => {
            const parts = r.value.split('-').map((s) => s.trim());
            const labels = r.sub ? r.sub.split(/\s+/).filter(Boolean) : [];
            const aligned = parts.length > 1 && parts.length === labels.length;
            return (
              <View
                key={r.label}
                style={[styles.gsRecRow, i > 0 && styles.gsRecRowDivided]}
              >
                <View style={styles.gsRecSlot}>
                  {i === 0 && recLogo ? (
                    <Image source={recLogo} style={styles.gsRecLogo} resizeMode="contain" />
                  ) : null}
                </View>
                <View style={styles.gsRec}>
                  <Text style={styles.gsRecLabel}>{r.label}</Text>
                  {aligned ? (
                    <View style={styles.gsRecGrid}>
                      {parts.map((p, j) => (
                        <React.Fragment key={j}>
                          {j > 0 ? <Text style={styles.gsRecDash}>-</Text> : null}
                          <View style={styles.gsRecPart}>
                            <Text style={styles.gsRecPartValue}>{p}</Text>
                            <Text style={styles.gsRecSub}>{labels[j]}</Text>
                          </View>
                        </React.Fragment>
                      ))}
                    </View>
                  ) : (
                    <>
                      <Text style={styles.gsRecValue}>{r.value}</Text>
                      {r.sub ? <Text style={styles.gsRecSub}>{r.sub}</Text> : null}
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {summary.note ? (
        <View style={styles.gsNote}>
          <Image
            source={require('../../assets/icons/games/trophy-blue.png')}
            style={styles.gsNoteIcon}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.gsNoteTitle}>{summary.note.title}</Text>
            <Text style={styles.gsNoteBody}>{summary.note.body}</Text>
          </View>
        </View>
      ) : null}

      {summary.next && summary.next.rows.length > 0 ? (
        <View style={styles.gsNext}>
          <View style={styles.gsNextHead}>
            <Image
              source={require('../../assets/icons/games/bracket-blue.png')}
              style={styles.gsNextIcon}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.gsNextTitle}>{summary.next.title}</Text>
              {summary.next.subtitle ? (
                <Text style={styles.gsNextSub}>{summary.next.subtitle}</Text>
              ) : null}
            </View>
          </View>
          {summary.next.rows.map((row) => (
            <View key={row.stage} style={styles.gsNextRow}>
              <Image
                source={require('../../assets/icons/icon-calendar.png')}
                style={styles.gsNextRowIcon}
                resizeMode="contain"
              />
              <View style={styles.gsNextRowMain}>
                <Text style={styles.gsNextStage}>{row.stage}</Text>
                <Text style={styles.gsNextWhen}>
                  {row.date}
                  {row.time ? `\n${row.time}` : ''}
                </Text>
              </View>
              {row.badge || row.place || row.detail ? (
                <View style={styles.gsNextRowRight}>
                  {row.badge ? (
                    <View style={styles.gsNextBadge}>
                      <Text style={styles.gsNextBadgeText}>{row.badge}</Text>
                    </View>
                  ) : null}
                  {row.place || row.detail ? (
                    <View style={styles.gsNextRowPlace}>
                      <View style={styles.gsNextPlaceLine}>
                        <Image
                          source={require('../../assets/icons/icon-pin-outline.png')}
                          style={styles.gsNextPin}
                          resizeMode="contain"
                        />
                        <Text style={styles.gsNextPlace}>{row.place?.split(' · ')[0]}</Text>
                      </View>
                      {row.place && row.place.includes(' · ') ? (
                        <Text style={styles.gsNextPlaceSub}>
                          {row.place.split(' · ').slice(1).join(' · ')}
                        </Text>
                      ) : null}
                      {row.detail ? (
                        <Text style={styles.gsNextDetail}>{row.detail}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Strip subtitle naming the platforms the listed people came from
// (Angelo, Oct 25) — same rule as web.
function stripSubText(events: EventItem[]): string {
  const plats = new Set(
    events.flatMap((e) =>
      (e.live_people ?? []).map((p) => p.platform).filter(Boolean),
    ) as string[],
  );
  const nameOf = (pl: string) =>
    pl === 'facebook' ? 'Facebook' : pl === 'x' ? 'X' : 'Instagram';
  const ordered = ['instagram', 'facebook', 'x']
    .filter((pl) => plats.has(pl))
    .map(nameOf);
  if (ordered.length === 1)
    return `People from ${ordered[0]} are out and about at these events!`;
  if (ordered.length >= 2)
    return `People from ${ordered.slice(0, -1).join(', ')}${ordered.length > 2 ? ',' : ''} and ${ordered[ordered.length - 1]} are at these events!`;
  return 'People from Instagram are out and about at these events!';
}

function havMi(
  a: { lat?: number | null; lng?: number | null },
  b: { lat?: number | null; lng?: number | null },
): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null)
    return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(h));
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
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

/** "Oct 25" badge for a pooled photo's game date. */
function badgeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Community block (Angelo mockup, Oct 29) — mirrors web CommunityBlock:
 * r/portlandme quotes, related bands, highlights, before the facts. */
const COMMUNITY_BAND_PHOTOS: Record<string, number> = {
  'band-dead-gowns-v2.jpg': require('../../assets/community/band-dead-gowns-v2.jpg'),
  'band-grief-mop-v2.jpg': require('../../assets/community/band-grief-mop-v2.jpg'),
  'band-viqueen-v2.jpg': require('../../assets/community/band-viqueen-v2.jpg'),
  'band-snake-lips-v2.jpg': require('../../assets/community/band-snake-lips-v2.jpg'),
  'band-little-oso-v2.jpg': require('../../assets/community/band-little-oso-v2.jpg'),
  'band-pearla-v2.jpg': require('../../assets/community/band-pearla-v2.jpg'),
};

function CommunityQuoteCard({ quote, meta, stackMeta }: { quote: CommunityQuote; meta?: string; stackMeta?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Long usernames: the meta drops to its own line under the name
  // (Angelo, Oct 29) instead of squeezing against the card edge.
  const stacked = quote.author.length >= 18;
  // Same submenu as the live/ended person rows (Angelo, Oct 29):
  // View Reddit profile / View Reddit comment / Send message.
  const menuItems = [
    {
      label: 'View Reddit profile',
      href: `https://www.reddit.com/user/${quote.author}`,
      icon: require('../../assets/icons/cb-reddit.png'),
    },
    ...(quote.permalink
      ? [
          {
            label: 'View Reddit comment',
            href: quote.permalink,
            icon: require('../../assets/icons/cb-comment.png'),
          },
        ]
      : []),
    {
      label: 'Send message',
      href: `https://www.reddit.com/message/compose/?to=${quote.author}`,
      icon: require('../../assets/icons/icon-chat-menu.png'),
    },
  ];
  return (
    <View style={[styles.cbQuote, menuOpen && { zIndex: 70 }]}>
      <Image source={require('../../assets/icons/cb-quote.png')} style={styles.cbQuoteMarkImg} resizeMode="contain" />
      <Text style={styles.cbQuoteText}>{quote.text}</Text>
      <View style={[styles.cbQuoteFoot, !stackMeta && stacked && { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
        <View style={[styles.personMenuWrap, { transform: [{ translateY: 4 }] }]}>
          <TouchableOpacity
            style={styles.cbPersonTrigger}
            onPress={() => setMenuOpen((o) => !o)}
            accessibilityLabel={`Actions for ${quote.author} on Reddit`}
          >
            {quote.avatar_url ? (
              <Image
                source={{ uri: quote.avatar_url.startsWith('/') ? `https://joinaroo.com${quote.avatar_url}` : quote.avatar_url }}
                style={styles.cbAvatar}
              />
            ) : (
              <View style={[styles.cbAvatar, styles.cbAvatarFallback]}>
                <Text style={styles.cbAvatarFallbackText}>{quote.author.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {stackMeta ? (
              <View style={styles.cbAttribution}>
                <Text style={styles.cbAuthor}>{quote.author}</Text>
                {meta ? <Text style={styles.cbMetaStacked}>{meta}</Text> : null}
              </View>
            ) : (
              <Text style={styles.cbAuthor}>{quote.author}</Text>
            )}
          </TouchableOpacity>
          {menuOpen ? (
            <View style={styles.cbPersonMenuList}>
              <View style={styles.cbPersonMenuCaret} />
              {menuItems.map((it, idx) => (
                <TouchableOpacity
                  key={it.label}
                  style={[styles.personMenuItem, idx > 0 && styles.personMenuItemDivider]}
                  onPress={() => {
                    setMenuOpen(false);
                    Linking.openURL(it.href);
                  }}
                >
                  <Image source={it.icon} style={styles.personMenuIcon} resizeMode="contain" />
                  <Text style={styles.personMenuItemText}>{it.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
        {!stackMeta && meta ? <Text style={[styles.cbMeta, stacked && { marginLeft: 42 }]}>{meta}</Text> : null}
      </View>
    </View>
  );
}

function CommunityBlockView({ data }: { data: CommunityBlockData }) {
  const sub = data.subreddit;
  return (
    <View style={styles.cbWrap}>
      <View style={[styles.cbPanel, styles.cbPanelBlue]}>
        <View style={[styles.cbHead, { justifyContent: 'center' }]}>
          <Image source={require('../../assets/icons/cb-reddit.png')} style={[styles.cbHeadIcon, { marginLeft: 30 }]} />
          <Text style={styles.cbHeadText}>From the {sub} community</Text>
        </View>
        <Text style={styles.cbIntro}>{data.intro}</Text>
        <CommunityQuoteCard
          quote={data.feature_quote}
          meta={data.feature_quote.ago ? `${sub} · ${data.feature_quote.ago}` : sub}
          stackMeta
        />
        <TouchableOpacity
          style={styles.cbBtn}
          onPress={() => Linking.openURL(data.thread_url)}
        >
          <Text style={styles.cbBtnText}>See more community recommendations &#8599;</Text>
        </TouchableOpacity>
      </View>

      {data.related_bands.length > 0 ? (
        <View style={[styles.cbPanel, styles.cbPanelPlain]}>
          <View style={[styles.cbHead, { justifyContent: 'center' }]}>
            <Text style={styles.cbHeadText}>Related local bands from the same thread</Text>
          </View>
          <Text style={styles.cbIntro}>
            Fans also mentioned these Portland bands. Check them out on Joinaroo!
          </Text>
          <View style={styles.cbBands}>
            {data.related_bands.map((b) => {
              const base = b.photo ? b.photo.split('/').pop() ?? '' : '';
              const src = COMMUNITY_BAND_PHOTOS[base];
              return (
                <TouchableOpacity
                  key={b.name}
                  style={styles.cbBand}
                  onPress={() =>
                    Linking.openURL(`https://joinaroo.com/?q=${encodeURIComponent(b.query)}`)
                  }
                >
                  {src ? <Image source={src} style={styles.cbBandPhoto} /> : null}
                  <Text style={styles.cbBandName} numberOfLines={1}>{b.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={{ alignItems: 'flex-end' }} onPress={() => Linking.openURL('https://joinaroo.com/?categories=on-stage')}>
            <Text style={styles.cbLink}>Explore more local music events &rarr;</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {data.highlights.length > 0 ? (
        <View style={[styles.cbPanel, styles.cbPanelMint]}>
          <View style={[styles.cbHead, { justifyContent: 'center' }]}>
            <Image source={require('../../assets/icons/cb-chat-green.png')} style={[styles.cbHeadIcon, { marginLeft: 30 }]} />
            <Text style={styles.cbHeadText}>What people are saying on {sub}</Text>
          </View>
          <Text style={styles.cbIntro}>
            A few highlights from the community discussion about the Portland music scene.
            These bands and venues keep coming up.
          </Text>
          <View style={styles.cbHighlights}>
            {data.highlights.map((q, i) => (
              <CommunityQuoteCard key={i} quote={q} meta={q.ago ?? undefined} />
            ))}
          </View>
          <TouchableOpacity style={{ alignItems: 'flex-end' }} onPress={() => Linking.openURL(data.thread_url)}>
            <Text style={styles.cbLink}>View the full {sub} thread &rarr;</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export default function EventDetailScreen({ route, navigation }: Props) {
  const { slug, scrollToPhotos, scrollToHero } = route.params;
  const { apiUrl, apiUrlReady } = useApp();
  const { token } = useAuth();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  // Which attended-person row has its ⋮ menu open (Angelo, Oct 25).
  const [menuFor, setMenuFor] = useState<number | null>(null);
  // Same submenu, opened by tapping an avatar in the LIVE panel.
  const [liveMenuFor, setLiveMenuFor] = useState<number | null>(null);
  // Same submenu, opened by tapping an avatar in the ENDED panel.
  const [endedMenuFor, setEndedMenuFor] = useState<number | null>(null);
  // People sheet opened from "N here now" / "Chat with people…" (Oct 25).
  const [sheetOpen, setSheetOpen] = useState(false);
  // "Event listing with photos": full-screen viewer over the pooled
  // recent photos, opened by "See recent photos" (Angelo, Oct 27).
  const [recentLbIdx, setRecentLbIdx] = useState<number | null>(null);
  // "I'm going — check in" on an event listing with photos (Oct 27):
  // going = the event is in the user's saves (same backing as web).
  const [going, setGoing] = useState(false);
  // "View photos (N)" deep link from an ended live card (Angelo,
  // Oct 25): scroll to the Photos section once it has laid out.
  const scrollRef = useRef<ScrollView>(null);
  const photosY = useRef<number | null>(null);
  const didDeepScroll = useRef(false);
  const tryDeepScroll = useCallback(() => {
    if (!scrollToPhotos || didDeepScroll.current || photosY.current == null) return;
    didDeepScroll.current = true;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, (photosY.current ?? 0) - 84), animated: true });
    }, 350);
  }, [scrollToPhotos]);
  useEffect(() => { tryDeepScroll(); }, [photos, event, tryDeepScroll]);
  useEffect(() => {
    if (!token || !event?.recent_photos) return;
    fetchServerSaves(apiUrl, token)
      .then((r) => setGoing(r.saves.some((e: any) => Number(e.id) === Number(event.id))))
      .catch(() => {});
  }, [token, event, apiUrl]);
  const toggleGoing = async () => {
    if (!event) return;
    if (!token) {
      Alert.alert('Sign In Required', 'You must be signed in to perform this action.');
      return;
    }
    try {
      if (going) await serverUnsave(apiUrl, token, Number(event.id));
      else await serverSave(apiUrl, token, Number(event.id));
      setGoing(!going);
    } catch {
      /* keep current state */
    }
  };
  // Tapping a live card in the strip lands on this page's hero photo
  // (Angelo, Oct 25): scroll to the hero once it has laid out.
  const heroY = useRef<number | null>(null);
  const didHeroScroll = useRef(false);
  const tryHeroScroll = useCallback(() => {
    if (!scrollToHero || didHeroScroll.current || heroY.current == null) return;
    didHeroScroll.current = true;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, (heroY.current ?? 0) - 84), animated: true });
    }, 350);
  }, [scrollToHero]);
  useEffect(() => { tryHeroScroll(); }, [event, tryHeroScroll]);
  // "Live Events Near You Right Now" strip data (Oct 25).
  const [stripEvents, setStripEvents] = useState<EventItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ev = await getEvent(apiUrl, slug);
      setEvent(ev);
      getEventPhotos(apiUrl, slug).then(setPhotos).catch(() => {});
      // Strip: on EVERY event page (Angelo, Oct 25 evening — including
      // one that is itself live), list today's other events carrying
      // credited attendee photos; only this event itself is excluded.
      {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date();
        dayEnd.setHours(23, 59, 59, 999);
        getEvents(apiUrl, {
          from: dayStart.toISOString(),
          to: dayEnd.toISOString(),
          limit: 200,
        })
          .then((r) =>
            setStripEvents(
              r.events.filter(
                (e) => e.id !== ev.id && (e.live_people?.length ?? 0) > 0,
              ),
            ),
          )
          .catch(() => setStripEvents([]));
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this event.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, slug]);

  useEffect(() => {
    if (apiUrlReady) load();
  }, [apiUrlReady, load]);

  const openMaps = useCallback(() => {
    if (!event) return;
    const v = event.venue;
    const query = [v.name, v.address, v.city, 'ME'].filter(Boolean).join(', ');
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    Linking.openURL(url).catch(() => {});
  }, [event]);

  const openSource = useCallback(() => {
    if (event?.url) Linking.openURL(event.url).catch(() => {});
  }, [event]);

  const addPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload event photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    if (!token) {
      // Uploads require sign-in, same rule as saving an event.
      Alert.alert('Sign In Required', 'You must be signed in to perform this action.');
      return;
    }
    const asset = result.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    setUploading(true);
    try {
      const photo = await uploadEventPhoto(apiUrl, slug, `data:${mime};base64,${asset.base64}`, undefined, token);
      setPhotos((prev) => [photo, ...prev]);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not upload the photo.');
    } finally {
      setUploading(false);
    }
  }, [apiUrl, slug, token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Event not found.'}</Text>
        <TouchableOpacity style={styles.btn} onPress={load}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const distance = formatDistance(event.distance_km);
  const timeLine = event.ends_at
    ? `${formatTime(event.starts_at)} – ${formatTime(event.ends_at)}`
    : formatTime(event.starts_at);
  const dp = DAY_PART_STYLE[timeOfDay(event.starts_at)];

  // Live listing: the event has credited photos from people there.
  const livePeople = event.live_people ?? [];
  const isLive = livePeople.length > 0;
  // Angelo (Oct 25): list everyone — no "+N more" tile in the panel.
  const shownLive = livePeople;
  // Angelo (Oct 25): once the live window closes (same instant the LIVE
  // pill comes off), the panel flips to its ended form per his mockup.
  const liveEnded = isLive && Date.now() >= livePillExpiresMs(event);
  // "Event listing with photos" (Angelo, Oct 27): upcoming + no own
  // photos -> the API pools the home team's last games' photos at this
  // venue into event.recent_photos; null on every other listing.
  const recentPhotos = event.recent_photos ?? null;
  const tookPlaceStr = new Date(event.starts_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  // Panel links open a DM with the person (Instagram's ig.me/m/<handle>
  // lands straight in the thread; Facebook's thread URL opens the
  // conversation, username parsed from a profile post URL); otherwise
  // their source post.
  const personHref = (p: LivePerson): string | null => {
    if (p.platform === 'instagram' && p.handle)
      return `https://ig.me/m/${p.handle}`;
    if (p.platform === 'facebook') {
      if (p.handle) return `https://www.facebook.com/messages/t/${p.handle}`;
      if (p.post_url) {
        const m = p.post_url.match(/facebook\.com\/([^/]+)\/posts\//);
        if (m) return `https://www.facebook.com/messages/t/${m[1]}`;
      }
    }
    return p.post_url ?? null;
  };
  const chatHref = livePeople.map(personHref).find((h) => h) ?? null;

  // Facts/photos ordering (Angelo, Oct 31, 2026): when the event has
  // photos, the facts render below the photos section; without photos
  // they stay under the title. Mirrors the web detail page.
  const hasPhotos = (event.photo_count ?? 0) > 0 || !!recentPhotos;
  const factsEl = (
        <View style={styles.factsBox}>
          {isLive && liveEnded ? (
            <View style={styles.endedHead}>
              <View style={styles.endedClock}>
                <Image
                  source={require('../../assets/icons/icon-clock.png')}
                  style={styles.endedClockImg}
                  resizeMode="contain"
                />
              </View>
              <View>
                <Text style={styles.endedTitle}>Event ended</Text>
                <Text style={styles.endedSub}>
                  This event took place on {tookPlaceStr}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.factRow}>
            <Image source={require('../../assets/icons/icon-calendar.png')} style={styles.factIcon} />
            <View style={styles.factContent}>
              <Text style={styles.label}>When</Text>
              <Text style={styles.value}>{formatDate(event.starts_at)}</Text>
              <Text style={[styles.value, { color: dp.text, fontWeight: '700' }]}>
                {dp.label} · {timeLine}
              </Text>
            </View>
          </View>
          <View style={styles.factRow}>
            <Image source={require('../../assets/icons/icon-pin-outline.png')} style={styles.factIcon} />
            <View style={styles.factContent}>
              <Text style={styles.label}>Where</Text>
              <Text style={styles.value}>{event.venue.name}</Text>
              {event.venue.address ? <Text style={styles.value}>{event.venue.address}</Text> : null}
              <Text style={styles.value}>{event.venue.city}, ME</Text>
              {distance ? <Text style={styles.distance}>{distance} away</Text> : null}
              <TouchableOpacity onPress={openMaps} style={styles.mapLink}>
                <Text style={styles.mapLinkText}>View on map</Text>
                <Image source={require('../../assets/icons/icon-arrow-right.png')} style={styles.inlineIcon} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.factRow}>
            <Image source={require('../../assets/icons/icon-ticket.png')} style={styles.factIcon} />
            <View style={styles.factContent}>
              <Text style={styles.label}>Cost</Text>
              <Text style={styles.value}>{event.sold_out ? 'Sold out' : costLabel(event)}</Text>
            </View>
          </View>
          {event.source ? (
            <View style={styles.factRow}>
              <Image source={require('../../assets/icons/icon-people.png')} style={styles.factIcon} />
              <View style={styles.factContent}>
                <Text style={styles.label}>Listed by</Text>
                {event.url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(event.url!)}>
                    <Text style={[styles.value, { color: '#044ff1' }]}>{event.source}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.value}>{event.source}</Text>
                )}
              </View>
            </View>
          ) : null}
        </View>
  );
  const galleryEl = (
      <View
        style={styles.galleryCard}
        onLayout={(e) => {
          photosY.current = e.nativeEvent.layout.y;
          tryDeepScroll();
        }}
      >
        <View style={styles.galleryHeader}>
          <Text style={styles.galleryTitle}>{isLive ? 'Photos from this event' : 'Photos'}</Text>
          {!isLive && (
            <TouchableOpacity
              style={[styles.addPhotoBtn, uploading && styles.disabledBtn]}
              onPress={addPhoto}
              disabled={uploading}
            >
              <Image source={require('../../assets/icons/icon-camera.png')} style={styles.addPhotoIcon} />
              <Text style={styles.addPhotoText}>{uploading ? 'Uploading…' : 'Add a photo'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {photos.length > 0 ? (
          <View style={styles.galleryGrid}>
            {photos.map((p) => (
              <Image
                key={p.id}
                source={{ uri: `${apiUrl}${p.url}` }}
                style={styles.galleryImage}
                resizeMode="cover"
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Image source={require('../../assets/icons/icon-image.png')} style={styles.emptyIcon} />
            <Text style={styles.emptyText}>No photos yet.</Text>
            <Text style={styles.emptySub}>Be the first to add a photo of this event!</Text>
          </View>
        )}
        {isLive && (
          <TouchableOpacity
            style={[styles.addPhotoBtn, styles.addPhotoBelow, uploading && styles.disabledBtn]}
            onPress={addPhoto}
            disabled={uploading}
          >
            <Image source={require('../../assets/icons/icon-camera.png')} style={styles.addPhotoIcon} />
            <Text style={styles.addPhotoText}>{uploading ? 'Uploading…' : 'Add a photo'}</Text>
          </TouchableOpacity>
        )}
      </View>
  );
  const descriptionEl = event.description ? (
    <>
      <Text style={styles.label}>About</Text>
      <Text style={styles.body}>{event.description}</Text>
    </>
  ) : null;

  return (
    <View style={styles.container}>
    <ScrollView style={styles.container} ref={scrollRef}>
      {stripEvents.length > 0 && (
        <View style={styles.strip}>
          <View style={styles.stripHead}>
            <Image
              source={require('../../assets/icons/icon-live-dot.png')}
              style={styles.stripDot}
            />
            <Text style={styles.stripTitle}>Live Events Near You Right Now</Text>
          </View>
          <Text style={styles.stripSub}>{stripSubText(stripEvents)}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stripRow}
          >
            {[...stripEvents]
              .map((e) => ({
                e,
                stillLive: Date.now() < livePillExpiresMs(e),
                pillExp: livePillExpiresMs(e),
                distMi: havMi(event.venue ?? {}, e.venue ?? {}),
              }))
              .sort(
                (a, b) =>
                  Number(b.stillLive) - Number(a.stillLive) ||
                  // Live order (Angelo, Oct 25): most people, then
                  // longest remaining live status, then nearest.
                  (b.e.live_people?.length ?? 0) -
                    (a.e.live_people?.length ?? 0) ||
                  b.pillExp - a.pillExp ||
                  (a.distMi ?? 1e9) - (b.distMi ?? 1e9),
              )
              .slice(0, 10)
              .map(({ e, stillLive, distMi }) => {
                const people = e.live_people ?? [];
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.stripCard}
                    onPress={() =>
                      navigation.push('EventDetail', { slug: e.slug, scrollToHero: true })
                    }
                  >
                    <View style={styles.stripPhotoWrap}>
                      {e.live_photo_url ?? e.image_url ? (
                        <Image
                          source={{ uri: (e.live_photo_url ?? e.image_url) as string }}
                          style={styles.stripPhoto}
                        />
                      ) : null}
                      {stillLive && (
                        <Image
                          source={require('../../assets/icons/icon-live-pill.png')}
                          style={styles.stripPill}
                          resizeMode="contain"
                        />
                      )}
                    </View>
                    {distMi !== null && (
                      <Text style={styles.stripDist}>{distMi.toFixed(1)} mi</Text>
                    )}
                    <Text style={styles.stripName} numberOfLines={2}>
                      {e.title}
                    </Text>
                    {e.venue ? (
                      <View style={styles.stripVenueRow}>
                        <Image
                          source={require('../../assets/icons/icon-pin-gray.png')}
                          style={styles.stripPin}
                        />
                        <Text style={styles.stripVenue} numberOfLines={1}>
                          {e.venue.name} · {e.venue.city}
                        </Text>
                      </View>
                    ) : null}
                    {stillLive ? (
                      <>
                        <View style={styles.stripPeople}>
                          {people.slice(0, 5).map((p, i) =>
                            p.avatar_url ? (
                              <Image
                                key={i}
                                source={{ uri: p.avatar_url }}
                                style={[styles.stripAvatar, i > 0 && styles.stripAvatarOverlap]}
                              />
                            ) : (
                              <View
                                key={i}
                                style={[styles.stripAvatar, styles.stripInitials, i > 0 && styles.stripAvatarOverlap]}
                              >
                                <Text style={styles.stripInitialsText}>{initialsOf(p.name)}</Text>
                              </View>
                            ),
                          )}
                          {people.length > 5 ? (
                            <View style={[styles.stripMore, styles.stripAvatarOverlap]}>
                              <Text style={styles.stripMoreText}>+{people.length - 5}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.stripCountRow}>
                          <View style={styles.stripCountDot} />
                          <Text style={styles.stripCount}>{people.length} here now</Text>
                        </View>
                      </>
                    ) : (
                      <View style={styles.stripEndedBlock}>
                        <View style={[styles.stripPeople, styles.stripEndedPeople]}>
                          {people.slice(0, 5).map((p, i) => (
                            <View
                              key={i}
                              style={[styles.stripEndedAvatarWrap, i > 0 && styles.stripAvatarOverlap]}
                            >
                              {p.avatar_url ? (
                                <Image source={{ uri: p.avatar_url }} style={styles.stripAvatar} />
                              ) : (
                                <View style={[styles.stripAvatar, styles.stripInitials]}>
                                  <Text style={styles.stripInitialsText}>{initialsOf(p.name)}</Text>
                                </View>
                              )}
                              <Image
                                source={require('../../assets/icons/icon-check-green.png')}
                                style={styles.stripEndedBadge}
                                resizeMode="contain"
                              />
                            </View>
                          ))}
                          {people.length > 5 ? (
                            <View style={[styles.stripMore, styles.stripAvatarOverlap]}>
                              <Text style={styles.stripMoreText}>+{people.length - 5}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.stripEndedTexts}>
                          <Text style={styles.stripEndedCount}>
                            {people.length} {people.length === 1 ? 'person' : 'people'} attended
                          </Text>
                          <Text style={styles.stripEndedSub}>{'Checked in · Attendance\nconfirmed'}</Text>
                          <TouchableOpacity
                            onPress={() =>
                              navigation.push('EventDetail', { slug: e.slug, scrollToPhotos: true })
                            }
                          >
                            <Text style={styles.stripEndedView}>View photos ({e.photo_count ?? 0}) →</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
          <View style={styles.stripFoot}>
            <TouchableOpacity
              style={styles.stripSeeAllWrap}
              onPress={() => navigation.navigate('Main')}
            >
              <Text style={styles.stripSeeAll}>See all live events</Text>
              <Image
                source={require('../../assets/icons/icon-arrow-right.png')}
                style={styles.stripSeeAllArrow}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {event.image_url ? (
        <View style={styles.heroWrap} onLayout={(e) => { heroY.current = e.nativeEvent.layout.y; tryHeroScroll(); }}>
          <Image source={{ uri: event.image_url }} style={styles.heroImage} resizeMode="cover" />
          {isLive ? (
            <>
              {Date.now() < livePillExpiresMs(event) ? (
                <Image
                  source={require('../../assets/icons/icon-live-hero.png')}
                  style={styles.liveHeroBadge}
                  resizeMode="contain"
                />
              ) : null}
              {photos.length > 0 ? (
                <View style={styles.heroPhotosPill}>
                  <Image source={require('../../assets/icons/icon-image.png')} style={styles.heroPhotosIcon} />
                  <Text style={styles.heroPhotosText}>View all photos ({photos.length})</Text>
                </View>
              ) : null}
            </>
          ) : null}
          {!isLive && event.sold_out ? (
            <Image
              source={require('../../assets/icons/soldout-ribbon.png')}
              style={styles.soldOutRibbon}
              resizeMode="contain"
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{event.category.name}</Text>
          </View>
          {event.recurrence ? (
            <View style={[styles.chip, styles.recurrenceChip]}>
              <Text style={[styles.chipText, styles.recurrenceChipText]}>
                Repeats {RECURRENCE_LABEL[event.recurrence] ?? event.recurrence}
              </Text>
            </View>
          ) : null}
          {event.featured ? (
            <View style={[styles.chip, styles.featuredChip]}>
              <Text style={[styles.chipText, styles.featuredChipText]}>Featured</Text>
            </View>
          ) : null}
        </View>
        {event.community ? (
          <View style={styles.communityPickPill}>
            <Image
              source={require('../../assets/icons/cb-reddit.png')}
              style={styles.communityPickIcon}
              resizeMode="contain"
            />
            <Text style={styles.communityPickName}>COMMUNITY PICK</Text>
            <Text style={styles.communityPickSub}>· r/portlandme</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{event.title}</Text>

        {event.sold_out ? (
          <View style={styles.soldOutPanel}>
            <Image
              source={require('../../assets/icons/soldout-ticket.png')}
              style={styles.soldOutPanelIcon}
              resizeMode="contain"
            />
            <View style={styles.soldOutPanelText}>
              <Text style={styles.soldOutPanelTitle}>SOLD OUT</Text>
              <Text style={styles.soldOutPanelSub}>
                Tickets for this event are no longer available.
              </Text>
            </View>
          </View>
        ) : null}

        {event.live_score &&
        event.live_score.status !== 'scheduled' &&
        event.live_score.home_score != null &&
        event.live_score.away_score != null ? (
          event.game_summary ? (
            <GameSummaryView
              score={event.live_score}
              summary={event.game_summary}
              startsAt={event.starts_at}
            />
          ) : (
          <View style={styles.scorePanel}>
            <Text
              style={
                event.live_score.status === 'live'
                  ? styles.scoreStatusLive
                  : styles.scoreStatus
              }
            >
              {event.live_score.status === 'live'
                ? `● LIVE${event.live_score.period ? ` · ${event.live_score.period}` : ''}`
                : 'FINAL SCORE'}
            </Text>
            <Text style={styles.scoreLine}>
              {event.live_score.home_team}{' '}
              <Text style={styles.scoreNum}>{event.live_score.home_score}</Text>
            </Text>
            <Text style={styles.scoreLine}>
              {event.live_score.away_team}{' '}
              <Text style={styles.scoreNum}>{event.live_score.away_score}</Text>
            </Text>
          </View>
          )
        ) : null}

        {event.community ? <CommunityBlockView data={event.community} /> : null}

        {!hasPhotos && factsEl}
        {hasPhotos && !recentPhotos && galleryEl}

        {isLive && liveEnded ? (
          <View style={styles.endedPanel}>
            <View style={styles.endedPeopleHead}>
              <Image
                source={require('../../assets/icons/icon-people-gray.png')}
                style={styles.endedPeopleIcon}
                resizeMode="contain"
              />
              <Text style={styles.endedPeopleHeadText}>
                People who attended ({livePeople.length})
              </Text>
            </View>
            {livePeople.map((p, i) => {
              const href = personHref(p);
              const platformLabel =
                p.platform === 'facebook'
                  ? 'Facebook'
                  : p.platform === 'x'
                    ? 'X'
                    : 'Instagram';
              const profileUrl =
                p.handle && p.platform === 'instagram'
                  ? `https://www.instagram.com/${p.handle}`
                  : p.handle && p.platform === 'facebook'
                    ? `https://www.facebook.com/${p.handle}`
                    : p.handle && p.platform === 'x'
                      ? `https://x.com/${p.handle}`
                      : null;
              const profileIcon =
                p.platform === 'facebook'
                  ? require('../../assets/icons/icon-facebook.png')
                  : p.platform === 'x'
                    ? require('../../assets/icons/icon-people-gray.png')
                    : require('../../assets/icons/icon-ig-outline.png');
              const menuItems = [
                profileUrl
                  ? {
                      label: `View ${platformLabel} profile`,
                      href: profileUrl,
                      icon: profileIcon,
                    }
                  : null,
                p.post_url
                  ? {
                      label: `View ${platformLabel} post`,
                      href: p.post_url,
                      icon: require('../../assets/icons/icon-image-navy.png'),
                    }
                  : null,
                href && href !== p.post_url
                  ? {
                      label: 'Send message',
                      href,
                      icon: require('../../assets/icons/icon-chat-menu.png'),
                    }
                  : null,
              ].filter(
                (x): x is { label: string; href: string; icon: number } =>
                  x !== null,
              );
              return (
                <View
                  key={i}
                  style={[
                    styles.endedPerson,
                    endedMenuFor === i && styles.livePersonMenuOpen,
                  ]}
                >
                  {/* Avatar tap opens the same submenu as the live
                      panel's avatar (Angelo, Oct 25). */}
                  <View style={[styles.personMenuWrap, { marginRight: 2 }]}>
                    <TouchableOpacity
                      disabled={menuItems.length === 0}
                      onPress={() =>
                        setEndedMenuFor(endedMenuFor === i ? null : i)
                      }
                    >
                      <View style={styles.endedAvatarWrap}>
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={styles.endedAvatar} />
                        ) : (
                          <View style={[styles.endedAvatar, styles.endedInitials]}>
                            <Text style={styles.endedInitialsText}>{initialsOf(p.name)}</Text>
                          </View>
                        )}
                        <Image
                          source={require('../../assets/icons/icon-check-green.png')}
                          style={styles.endedCheck}
                        />
                      </View>
                    </TouchableOpacity>
                    {endedMenuFor === i && menuItems.length > 0 && (
                      <View style={styles.endedAvatarMenuList}>
                        <View style={styles.endedAvatarMenuCaret} />
                        {menuItems.map((it, idx) => (
                          <TouchableOpacity
                            key={it.label}
                            style={[
                              styles.personMenuItem,
                              idx > 0 && styles.personMenuItemDivider,
                            ]}
                            onPress={() => {
                              setEndedMenuFor(null);
                              Linking.openURL(it.href).catch(() => {});
                            }}
                          >
                            <Image
                              source={it.icon}
                              style={styles.personMenuIcon}
                              resizeMode="contain"
                            />
                            <Text style={styles.personMenuItemText}>{it.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.endedPersonMain}
                    disabled={!href}
                    onPress={() => {
                      if (href) Linking.openURL(href).catch(() => {});
                    }}
                  >
                    <View>
                      <Text style={styles.endedName}>{shortName(p.name)}</Text>
                      <Text style={styles.endedStatus}>Checked in • Attended</Text>
                    </View>
                  </TouchableOpacity>
                  {href ? (
                    <TouchableOpacity
                      style={styles.endedMsg}
                      onPress={() => Linking.openURL(href).catch(() => {})}
                    >
                      <Image
                        source={require('../../assets/icons/icon-chat.png')}
                        style={styles.endedMsgIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.endedMsgText}>Message</Text>
                    </TouchableOpacity>
                  ) : null}
                  {menuItems.length === 0 ? null : (
                    <View style={styles.personMenuWrap}>
                        <TouchableOpacity
                          onPress={() => setMenuFor(menuFor === i ? null : i)}
                          hitSlop={8}
                        >
                          <Text style={styles.endedDots}>⋮</Text>
                        </TouchableOpacity>
                        {menuFor === i && (
                          <View style={styles.personMenuList}>
                            <View style={styles.personMenuCaret} />
                            {menuItems.map((it, idx) => (
                              <TouchableOpacity
                                key={it.label}
                                style={[
                                  styles.personMenuItem,
                                  idx > 0 && styles.personMenuItemDivider,
                                ]}
                                onPress={() => {
                                  setMenuFor(null);
                                  Linking.openURL(it.href).catch(() => {});
                                }}
                              >
                                <Image
                                  source={it.icon}
                                  style={styles.personMenuIcon}
                                  resizeMode="contain"
                                />
                                <Text style={styles.personMenuItemText}>{it.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                </View>
              );
            })}
          </View>
        ) : isLive ? (
          <View style={styles.livePanel}>
            <View style={styles.livePanelHead}>
              <View style={styles.livePanelTitleRow}>
                <View style={styles.livePanelDot} />
                <Text style={styles.livePanelTitle}>Live now!</Text>
              </View>
              <TouchableOpacity onPress={() => setSheetOpen(true)}>
                <Text style={styles.livePanelCount}>{livePeople.length} here now ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.livePanelSub}>
              People from{' '}
              {livePeople[0]?.platform === 'facebook'
                ? 'Facebook'
                : livePeople[0]?.platform === 'x'
                  ? 'X'
                  : 'Instagram'}{' '}
              are at this event
            </Text>
            <View
              style={[
                styles.livePeopleRow,
                livePeople.length > 2 && styles.livePeopleRowCentered,
              ]}
            >
              {shownLive.map((p, i) => {
                const href = personHref(p);
                const platformLabel =
                  p.platform === 'facebook'
                    ? 'Facebook'
                    : p.platform === 'x'
                      ? 'X'
                      : 'Instagram';
                const profileUrl =
                  p.handle && p.platform === 'instagram'
                    ? `https://www.instagram.com/${p.handle}`
                    : p.handle && p.platform === 'facebook'
                      ? `https://www.facebook.com/${p.handle}`
                      : p.handle && p.platform === 'x'
                        ? `https://x.com/${p.handle}`
                        : null;
                const profileIcon =
                  p.platform === 'facebook'
                    ? require('../../assets/icons/icon-facebook.png')
                    : p.platform === 'x'
                      ? require('../../assets/icons/icon-people-gray.png')
                      : require('../../assets/icons/icon-ig-outline.png');
                const items = [
                  profileUrl
                    ? { label: `View ${platformLabel} profile`, href: profileUrl, icon: profileIcon }
                    : null,
                  p.post_url
                    ? { label: `View ${platformLabel} post`, href: p.post_url, icon: require('../../assets/icons/icon-image-navy.png') }
                    : null,
                  href && href !== p.post_url
                    ? { label: 'Send message', href, icon: require('../../assets/icons/icon-chat-menu.png') }
                    : null,
                ].filter(
                  (x): x is { label: string; href: string; icon: number } => x !== null,
                );
                return (
                  <View
                    key={i}
                    style={[styles.livePerson, liveMenuFor === i && styles.livePersonMenuOpen]}
                  >
                    <View style={styles.personMenuWrap}>
                      <TouchableOpacity
                        disabled={items.length === 0}
                        onPress={() => setLiveMenuFor(liveMenuFor === i ? null : i)}
                      >
                        <View style={styles.liveAvatarWrap}>
                          {p.avatar_url ? (
                            <Image source={{ uri: p.avatar_url }} style={styles.liveAvatar} />
                          ) : (
                            <View style={[styles.liveAvatar, styles.liveAvatarInitials]}>
                              <Text style={styles.liveAvatarInitialsText}>{initialsOf(p.name)}</Text>
                            </View>
                          )}
                          <View style={styles.livePresence} />
                        </View>
                      </TouchableOpacity>
                      {liveMenuFor === i && items.length > 0 && (
                        <View style={styles.personMenuListLive}>
                          <View style={styles.personMenuCaretLive} />
                          {items.map((it, idx) => (
                            <TouchableOpacity
                              key={it.label}
                              style={[
                                styles.personMenuItem,
                                idx > 0 && styles.personMenuItemDivider,
                              ]}
                              onPress={() => {
                                setLiveMenuFor(null);
                                Linking.openURL(it.href).catch(() => {});
                              }}
                            >
                              <Image
                                source={it.icon}
                                style={styles.personMenuIcon}
                                resizeMode="contain"
                              />
                              <Text style={styles.personMenuItemText}>{it.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      disabled={!href}
                      onPress={() => {
                        if (href) Linking.openURL(href).catch(() => {});
                      }}
                    >
                      <Text style={styles.livePersonName}>{shortName(p.name)}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.liveChatBtn}
              onPress={() => setSheetOpen(true)}
            >
              <Image
                source={require('../../assets/icons/icon-chat.png')}
                style={styles.liveChatIcon}
                resizeMode="contain"
              />
              <Text style={styles.liveChatText}>Chat with people at this event →</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Modal
          visible={sheetOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setSheetOpen(false)}
        >
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setSheetOpen(false)}
          >
            <View style={styles.sheetCard} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>
                  People at this event ({livePeople.length})
                </Text>
                <TouchableOpacity
                  style={styles.sheetClose}
                  onPress={() => setSheetOpen(false)}
                >
                  <Text style={styles.sheetCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView>
                {livePeople.map((p, i) => {
                  const href = personHref(p);
                  const platformLabel =
                    p.platform === 'facebook'
                      ? 'Facebook'
                      : p.platform === 'x'
                        ? 'X'
                        : 'Instagram';
                  const profileUrl =
                    p.handle && p.platform === 'instagram'
                      ? `https://www.instagram.com/${p.handle}`
                      : p.handle && p.platform === 'facebook'
                        ? `https://www.facebook.com/${p.handle}`
                        : p.handle && p.platform === 'x'
                          ? `https://x.com/${p.handle}`
                          : null;
                  const profileIcon =
                    p.platform === 'facebook'
                      ? require('../../assets/icons/icon-facebook.png')
                      : p.platform === 'x'
                        ? require('../../assets/icons/icon-people-gray.png')
                        : require('../../assets/icons/icon-ig-outline.png');
                  const items = [
                    profileUrl
                      ? { label: `View ${platformLabel} profile`, href: profileUrl, icon: profileIcon }
                      : null,
                    p.post_url
                      ? { label: `View ${platformLabel} post`, href: p.post_url, icon: require('../../assets/icons/icon-image-navy.png') }
                      : null,
                    href && href !== p.post_url
                      ? { label: 'Send message', href, icon: require('../../assets/icons/icon-chat-menu.png') }
                      : null,
                  ].filter(
                    (x): x is { label: string; href: string; icon: number } => x !== null,
                  );
                  return (
                    <View key={i} style={[styles.endedPerson, styles.sheetRow]}>
                      <TouchableOpacity
                        style={styles.endedPersonMain}
                        disabled={!href}
                        onPress={() => {
                          if (href) Linking.openURL(href).catch(() => {});
                        }}
                      >
                        <View style={styles.endedAvatarWrap}>
                          {p.avatar_url ? (
                            <Image source={{ uri: p.avatar_url }} style={styles.endedAvatar} />
                          ) : (
                            <View style={[styles.endedAvatar, styles.endedInitials]}>
                              <Text style={styles.endedInitialsText}>{initialsOf(p.name)}</Text>
                            </View>
                          )}
                          <View style={styles.sheetPresence} />
                        </View>
                        <View>
                          <Text style={styles.endedName}>{shortName(p.name)}</Text>
                          <Text style={styles.endedStatus}>Checked in • Here now</Text>
                        </View>
                      </TouchableOpacity>
                      {href ? (
                        <TouchableOpacity
                          style={styles.endedMsg}
                          onPress={() => Linking.openURL(href).catch(() => {})}
                        >
                          <Image
                            source={require('../../assets/icons/icon-chat.png')}
                            style={styles.endedMsgIcon}
                            resizeMode="contain"
                          />
                          <Text style={styles.endedMsgText}>Message</Text>
                        </TouchableOpacity>
                      ) : null}
                      {items.length > 0 && (
                        <View style={styles.personMenuWrap}>
                          <TouchableOpacity
                            onPress={() => setMenuFor(menuFor === i ? null : i)}
                            hitSlop={8}
                          >
                            <Text style={styles.endedDots}>⋮</Text>
                          </TouchableOpacity>
                          {menuFor === i && (
                            <View style={styles.personMenuList}>
                              <View style={styles.personMenuCaret} />
                              {items.map((it, idx) => (
                                <TouchableOpacity
                                  key={it.label}
                                  style={[
                                    styles.personMenuItem,
                                    idx > 0 && styles.personMenuItemDivider,
                                  ]}
                                  onPress={() => {
                                    setMenuFor(null);
                                    setSheetOpen(false);
                                    Linking.openURL(it.href).catch(() => {});
                                  }}
                                >
                                  <Image
                                    source={it.icon}
                                    style={styles.personMenuIcon}
                                    resizeMode="contain"
                                  />
                                  <Text style={styles.personMenuItemText}>{it.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {hasPhotos && !recentPhotos && factsEl}
        {!hasPhotos && descriptionEl}

        {!isLive && recentPhotos ? (
          <>
            <View style={styles.recentSection}>
              <View style={styles.recentHead}>
                <Text style={styles.recentTitle}>Recent game-day photos</Text>
                <View style={styles.recentPill}>
                  <Text style={styles.recentPillText}>RECENT HOME GAMES</Text>
                </View>
              </View>
              <Text style={styles.recentSub}>
                {recentPhotos.games.length > 1
                  ? `From the last ${recentPhotos.games.length} ${recentPhotos.team} home games`
                  : `From the last ${recentPhotos.team} home game`}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {recentPhotos.photos.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={i > 0 ? styles.recentThumbGap : undefined}
                    onPress={() =>
                      navigation.push('EventDetail', {
                        slug: p.event_slug,
                        scrollToPhotos: true,
                      })
                    }
                  >
                    <Image
                      source={{ uri: `${apiUrl}${p.url}` }}
                      style={styles.recentThumb}
                      resizeMode="cover"
                    />
                    <View style={styles.recentBadge}>
                      <Image
                        source={require('../../assets/icons/icon-camera.png')}
                        style={styles.recentBadgeIcon}
                      />
                      <Text style={styles.recentBadgeText}>
                        {badgeDate(p.event_starts_at)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.recentMeta}>
                <View style={styles.recentMetaLeft}>
                  <Image
                    source={require('../../assets/icons/icon-image.png')}
                    style={styles.recentMetaIcon}
                  />
                  <Text style={styles.recentMetaText}>
                    {recentPhotos.total} photos shared
                    {recentPhotos.last_people.length > 0
                      ? ` • ${recentPhotos.last_people.length} ${
                          recentPhotos.last_people.length === 1 ? 'fan' : 'fans'
                        } checked in last game`
                      : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.recentActions}>
                <View style={styles.recentAddWrap}>
                  <TouchableOpacity
                    style={[styles.addPhotoBtn, uploading && styles.disabledBtn]}
                    onPress={addPhoto}
                    disabled={uploading}
                  >
                    <Image source={require('../../assets/icons/icon-camera.png')} style={styles.addPhotoIcon} />
                    <Text style={styles.addPhotoText}>{uploading ? 'Uploading…' : 'Add a photo'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setRecentLbIdx(0)}>
                  <Text style={styles.recentSee}>See recent photos →</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.fansPanel}>
              <Text style={styles.fansTitle}>
                Fans are already sharing game-day moments
              </Text>
              <View style={styles.fansRow}>
                {recentPhotos.last_people.length > 0 ? (
                  <View style={styles.fansAvatars}>
                    {recentPhotos.last_people.slice(0, 5).map((p, i) =>
                      p.avatar_url ? (
                        <Image
                          key={i}
                          source={{ uri: p.avatar_url }}
                          style={[
                            styles.fansAvatar,
                            i > 0 && styles.fansAvatarOverlap,
                          ]}
                        />
                      ) : (
                        <View
                          key={i}
                          style={[
                            styles.fansAvatar,
                            styles.fansInitials,
                            i > 0 && styles.fansAvatarOverlap,
                          ]}
                        >
                          <Text style={styles.fansInitialsText}>
                            {initialsOf(p.name)}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                ) : null}
                <Text style={styles.fansText}>
                  Join fans who check in and share photos at {recentPhotos.team}{' '}
                  games.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.checkinBtn, going && styles.checkinBtnOn]}
                onPress={toggleGoing}
              >
                <Image
                  source={require('../../assets/icons/icon-pin-white.png')}
                  style={styles.checkinBtnIcon}
                />
                <Text style={styles.checkinBtnText}>I&apos;m going — check in</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {hasPhotos && !!recentPhotos && factsEl}
        {hasPhotos && descriptionEl}

        {event.sold_out ? (
          Date.now() < detailsButtonExpiresMs(event) ? (
            <View style={[styles.primaryBtn, styles.soldOutBtn]}>
              <Image source={require('../../assets/icons/soldout-ticket-white.png')} style={styles.soldOutBtnIcon} />
              <Text style={styles.primaryBtnText}>SOLD OUT</Text>
            </View>
          ) : null
        ) : event.url && Date.now() < detailsButtonExpiresMs(event) ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={openSource}>
            <Image source={require('../../assets/icons/icon-external-white.png')} style={styles.btnIcon} />
            <Text style={styles.primaryBtnText}>{event.cost_free ? 'More Event Details' : 'More Event Details and Tickets'}</Text>
            <Image source={require('../../assets/icons/icon-arrow-white.png')} style={styles.btnArrow} />
          </TouchableOpacity>
        ) : null}
      </View>

      {!hasPhotos && !recentPhotos && galleryEl}
    </ScrollView>
    {recentPhotos && (
      <Modal
        visible={recentLbIdx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRecentLbIdx(null)}
      >
        <View style={styles.lbRoot}>
          <FlatList
            data={recentPhotos.photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={recentLbIdx ?? 0}
            getItemLayout={(_, i) => ({
              length: SCREEN_W,
              offset: SCREEN_W * i,
              index: i,
            })}
            onMomentumScrollEnd={(e) =>
              setRecentLbIdx(
                Math.max(
                  0,
                  Math.min(
                    recentPhotos.photos.length - 1,
                    Math.round(e.nativeEvent.contentOffset.x / SCREEN_W),
                  ),
                ),
              )
            }
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_W }}>
                <Image
                  source={{ uri: `${apiUrl}${item.url}` }}
                  style={styles.lbImage}
                  resizeMode="contain"
                />
              </View>
            )}
          />
          <Text style={styles.lbCounter}>
            {(recentLbIdx ?? 0) + 1} of {recentPhotos.photos.length}
          </Text>
          <TouchableOpacity
            style={styles.lbClose}
            onPress={() => setRecentLbIdx(null)}
            aria-label="Close photo viewer"
          >
            <Text style={styles.lbCloseText}>×</Text>
          </TouchableOpacity>
          {(() => {
            const cur = recentPhotos.photos[recentLbIdx ?? 0];
            if (!cur?.caption && !cur?.source) return null;
            const src = cur.source;
            const handle = src ? (src.x_username ?? src.ig_username) : null;
            const isFan = !!(src?.x_post_url || src?.ig_post_url || src?.facebook);
            return (
              <View style={styles.lbFooter}>
                {cur.caption ? (
                  <Text style={styles.lbCaption}>{cur.caption}</Text>
                ) : null}
                {src ? (
                  <Text style={styles.lbCredit}>
                    {isFan ? src.name : `Photographer: ${src.name}`}
                    {isFan && handle ? ` - @${handle}` : ''}
                  </Text>
                ) : null}
              </View>
            );
          })()}
        </View>
      </Modal>
    )}
    <TabBarReplica navigation={navigation} active="Events" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#B00020', textAlign: 'center', marginBottom: 12 },
  // Angelo (Oct 25): no card panel on the detail page — flat white like
  // the live listing treatment, on web and native alike.
  card: {
    backgroundColor: '#fff',
    padding: 18,
  },
  row: { flexDirection: 'row', marginBottom: 10 },
  chip: {
    backgroundColor: '#E8EEF7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginRight: 8,
  },
  chipText: { color: '#0B1D3A', fontSize: 12, fontWeight: '600' },
  featuredChip: { backgroundColor: '#FFF3D6' },
  featuredChipText: { color: '#8A5A00' },
  communityPickPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#D7E7FC', borderRadius: 999, paddingVertical: 4, paddingLeft: 5, paddingRight: 12, gap: 7, marginTop: 8 },
  communityPickIcon: { width: 22, height: 22 },
  communityPickName: { fontSize: 12, fontWeight: '800', color: '#025CDF' },
  communityPickSub: { fontSize: 12, fontWeight: '600', color: '#16324A' },
  // Community block (Angelo mockup, Oct 29) — mirrors web CommunityBlock.
  cbWrap: { gap: 12, marginBottom: 14 },
  cbPanel: { borderRadius: 16, padding: 16 },
  cbPanelBlue: { backgroundColor: '#E9F1FE' },
  cbPanelPlain: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E9F2' },
  cbPanelMint: { backgroundColor: '#EAF7EE' },
  cbHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  cbHeadIcon: { width: 30, height: 30 },
  cbHeadText: { fontSize: 19, fontWeight: '700', color: '#0B1D3A', flexShrink: 1 },
  cbIntro: { color: '#43536B', fontSize: 14.5, lineHeight: 20, marginBottom: 12 },
  cbQuote: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, shadowColor: '#101828', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cbQuoteMarkImg: { width: 36, height: 31, marginBottom: 6 },
  cbQuoteText: { fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: '#16283F' },
  cbQuoteFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  cbPersonTrigger: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cbPersonMenuList: { position: 'absolute', left: 0, top: 40, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E8EF', borderRadius: 18, paddingVertical: 8, minWidth: 248, zIndex: 60, elevation: 8, shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 16 } },
  cbPersonMenuCaret: { position: 'absolute', top: -8, left: 17, width: 14, height: 14, backgroundColor: '#fff', borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#E3E8EF', transform: [{ rotate: '45deg' }] },
  cbAvatar: { width: 32, height: 32, borderRadius: 16 },
  cbAvatarFallback: { backgroundColor: '#DCE7F5', alignItems: 'center', justifyContent: 'center' },
  cbAvatarFallbackText: { color: '#2C5AA0', fontWeight: '700', fontSize: 14 },
  cbAuthor: { fontWeight: '600', color: '#16283F', fontSize: 14, lineHeight: 16 },
  cbAttribution: { flexDirection: 'column', gap: 2 },
  cbMeta: { marginLeft: 'auto', color: '#71809A', fontSize: 13, lineHeight: 16 },
  cbMetaStacked: { color: '#71809A', fontSize: 12.5, lineHeight: 15 },
  cbBtn: { alignSelf: 'flex-start', marginTop: 14, borderWidth: 1.5, borderColor: '#2563EB', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  cbBtnText: { color: '#1D4ED8', fontWeight: '600', fontSize: 14 },
  cbBands: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  cbBand: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F0F3F8', borderRadius: 999, paddingVertical: 4, paddingLeft: 4, paddingRight: 12, width: '48.5%' },
  cbBandPhoto: { width: 38, height: 38, borderRadius: 19 },
  cbBandName: { fontWeight: '600', fontSize: 13, color: '#16283F', flexShrink: 1 },
  cbLink: { color: '#1D4ED8', fontWeight: '600', fontSize: 14.5 },
  cbHighlights: { gap: 10, marginBottom: 14 },
  recurrenceChip: { backgroundColor: '#E8F0FE' },
  recurrenceChipText: { color: '#1A56DB' },
  heroImage: { width: '100%', height: 220 },
  galleryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    margin: 12,
    marginTop: 0,
  },
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addPhotoBelow: { alignSelf: 'flex-start', marginTop: 12 },
  addPhotoIcon: { width: 16, height: 16, marginRight: 6 },
  addPhotoText: { color: '#2563EB', fontSize: 13, fontWeight: '600' },
  emptyBox: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  emptyIcon: { width: 32, height: 32, opacity: 0.5, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#666' },
  emptySub: { fontSize: 12, color: '#888', marginTop: 4 },
  galleryTitle: { fontSize: 18, fontWeight: '700', color: '#0B1D3A', marginBottom: 12 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  galleryImage: { width: 110, height: 110, borderRadius: 8, backgroundColor: '#EDEFF2' },
  galleryNote: { fontSize: 12, color: '#6B7280', marginTop: 8, textAlign: 'center' },
  disabledBtn: { opacity: 0.6 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 14 },
  factsBox: {
    backgroundColor: '#F4F5F7',
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  scorePanel: {
    backgroundColor: '#F6F7F9',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  scoreStatus: { color: '#5B7186', fontWeight: '800', fontSize: 12, letterSpacing: 0.7 },
  scoreStatusLive: { color: '#C81E1E', fontWeight: '800', fontSize: 12, letterSpacing: 0.7 },
  scoreLine: { fontSize: 17, marginTop: 4, color: '#17202B' },
  scoreNum: { fontWeight: '800' },
  // Game-summary module (Angelo, Oct 28) — mirrors web GameSummary.
  gsModule: { marginTop: 12, gap: 12 },
  gsPanel: { backgroundColor: '#F6F7F9', borderRadius: 18, padding: 16 },
  gsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gsLogo: { width: 62, height: 62 },
  gsScore: { fontSize: 32, fontWeight: '800', minWidth: 34, textAlign: 'center', color: '#17202B' },
  gsMid: { flex: 1, alignItems: 'center', gap: 5 },
  gsPill: { backgroundColor: '#0B1D3A', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 16 },
  gsPillLive: { backgroundColor: '#C81E1E', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 16 },
  gsPillText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.7 },
  gsDate: { color: '#5B7186', fontSize: 13, textAlign: 'center', width: '100%' },
  gsNames: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  gsTeam: { width: '45%' },
  gsTeamRight: { alignItems: 'flex-end' },
  gsTeamName: { fontWeight: '700', fontSize: 16, color: '#17202B' },
  gsTeamMascot: { color: '#5B7186', fontSize: 12, letterSpacing: 1.1, marginTop: 1 },
  gsRecordsPanel: { flexDirection: 'column' },
  gsRecordsWithLogo: { paddingRight: 84 },
  gsRecRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  gsRecRowDivided: { borderTopWidth: 1, borderTopColor: '#E3E8EF', marginTop: 12, paddingTop: 12 },
  gsRecSlot: { width: 54 },
  gsRecLogo: { width: 54, height: 54, marginTop: 10, marginLeft: 20 },
  gsRec: { flex: 1, paddingHorizontal: 2, alignItems: 'center' },
  gsRecLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: '#5B7186' },
  gsRecValue: { fontSize: 25, fontWeight: '800', marginVertical: 2, color: '#17202B' },
  gsRecSub: { fontSize: 11, color: '#5B7186' },
  gsRecGrid: { flexDirection: 'row', justifyContent: 'center', marginTop: 2 },
  gsRecDash: { width: 30, textAlign: 'center', fontSize: 25, fontWeight: '800', color: '#17202B', lineHeight: 29 },
  gsRecPart: { width: 44, alignItems: 'center' },
  gsRecPartValue: { fontSize: 25, fontWeight: '800', color: '#17202B', lineHeight: 29 },
  gsNote: { backgroundColor: '#EAF1FB', borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12 },
  gsNoteIcon: { width: 30, height: 30, marginTop: 2 },
  gsNoteTitle: { fontSize: 16, fontWeight: '800', color: '#1D6FE0', marginBottom: 4 },
  gsNoteBody: { fontSize: 14, lineHeight: 20, color: '#17202B' },
  gsNext: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E8EF', borderRadius: 18, padding: 16 },
  gsNextHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gsNextIcon: { width: 32, height: 32 },
  gsNextTitle: { fontSize: 17, fontWeight: '800', color: '#17202B' },
  gsNextSub: { color: '#5B7186', fontSize: 13, marginTop: 1 },
  gsNextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F6F7F9', borderRadius: 14, padding: 12, marginTop: 10 },
  gsNextRowIcon: { width: 20, height: 20, marginTop: 2 },
  gsNextRowMain: { flex: 1, minWidth: 0 },
  gsNextStage: { fontWeight: '700', fontSize: 14, color: '#17202B' },
  gsNextWhen: { color: '#5B7186', fontSize: 12, marginTop: 1 },
  gsNextRowRight: { marginLeft: 'auto', flexShrink: 0, gap: 8, alignItems: 'center' },
  gsNextRowPlace: {},
  gsNextPlaceLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gsNextPin: { width: 14, height: 14 },
  gsNextPlace: { fontSize: 13, color: '#33475C' },
  gsNextPlaceSub: { fontSize: 13, color: '#33475C', paddingLeft: 18, textAlign: 'center' },
  gsNextDetail: { color: '#5B7186', fontSize: 12, marginTop: 1, paddingLeft: 18 },
  gsNextBadge: { backgroundColor: '#D9E8F8', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  gsNextBadgeText: { color: '#1D4ED8', fontWeight: '800', fontSize: 11, letterSpacing: 0.6 },
  factRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  factIcon: { width: 24, height: 24, marginRight: 12, marginTop: 2 },
  factContent: { flex: 1 },
  mapLink: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  mapLinkText: { color: '#044ff1', fontWeight: '600', fontSize: 14 },
  inlineIcon: { width: 16, height: 16, marginLeft: 4 },
  btnIcon: { width: 20, height: 20 },
  btnArrow: { width: 16, height: 16, marginLeft: 8 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0B1D3A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 4,
  },
  value: { fontSize: 15, color: '#222', marginBottom: 2 },
  body: { fontSize: 15, color: '#333', lineHeight: 22 },
  distance: { fontSize: 14, color: '#2E7D32', fontWeight: '700', marginTop: 4 },
  primaryBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, marginHorizontal: 8 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryBtnText: { color: '#2563EB', fontWeight: '700', fontSize: 15, marginHorizontal: 8 },
  source: { fontSize: 12, color: '#888', marginTop: 14, textAlign: 'center' },
  btn: { backgroundColor: '#0B1D3A', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
  heroWrap: { position: 'relative' },
  soldOutRibbon: { position: 'absolute', left: 0, top: 0, width: '54%', aspectRatio: 612 / 420 },
  soldOutPanel: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FDE9EA', borderRadius: 16, padding: 16, marginBottom: 16,
  },
  soldOutPanelIcon: { width: 56, height: 51 },
  soldOutPanelText: { flex: 1 },
  soldOutPanelTitle: { fontSize: 21, fontWeight: '800', color: '#8A0203', letterSpacing: 0.4 },
  soldOutPanelSub: { fontSize: 14.5, color: '#8A0203', opacity: 0.8, marginTop: 2 },
  soldOutBtn: { backgroundColor: '#99A1AC' },
  soldOutBtnIcon: { width: 26, height: 24, resizeMode: 'contain', marginRight: 10 },
  liveHeroBadge: { position: 'absolute', top: 12, right: 12, height: 30, width: 73 },
  heroPhotosPill: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(18,18,18,0.85)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroPhotosIcon: { width: 16, height: 16, tintColor: '#fff' },
  heroPhotosText: { color: '#fff', fontSize: 13.5, fontWeight: '600' },
  livePanel: {
    backgroundColor: '#EAFAF0',
    borderWidth: 1,
    borderColor: '#CDEEDA',
    borderRadius: 16,
    padding: 18,
    marginTop: 18,
  },
  livePanelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  livePanelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  livePanelDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  livePanelTitle: { color: '#1D9E4B', fontSize: 20, fontWeight: '800' },
  livePanelCount: { color: '#1D9E4B', fontWeight: '700', fontSize: 15 },
  livePanelSub: { color: '#5B6B60', marginTop: 3, marginBottom: 14, marginLeft: 23, fontSize: 14.5 },
  livePeopleRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  livePeopleRowCentered: { justifyContent: 'center' },
  endedPanel: { backgroundColor: '#EEF1F6', borderRadius: 18, padding: 18, marginTop: 18 },
  endedHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#DDE3EC' },
  endedClock: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#DFE4EC', alignItems: 'center', justifyContent: 'center' },
  endedClockImg: { width: 30, height: 30 },
  endedTitle: { fontSize: 17.5, fontWeight: '800', color: '#17202B' },
  endedSub: { fontSize: 14, color: '#5D6B80', marginTop: 1 },
  endedPeopleHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 14, paddingBottom: 4 },
  endedPeopleIcon: { width: 27, height: 20 },
  endedPeopleHeadText: { fontSize: 16.5, fontWeight: '800', color: '#17202B' },
  endedPerson: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  endedPersonMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  endedAvatarWrap: { position: 'relative' },
  endedAvatar: { width: 56, height: 56, borderRadius: 28 },
  endedInitials: { backgroundColor: '#C9D3E0', alignItems: 'center', justifyContent: 'center' },
  endedInitialsText: { fontWeight: '700', fontSize: 18, color: '#33507E' },
  endedCheck: { position: 'absolute', right: -2, bottom: -2, width: 21, height: 21 },
  endedName: { fontSize: 16.5, fontWeight: '700', color: '#17202B' },
  endedStatus: { fontSize: 13.5, color: '#5D6B80' },
  endedMsg: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#DBEAFE', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  endedMsgIcon: { height: 17, width: 17 },
  endedMsgText: { color: '#044FF1', fontWeight: '700', fontSize: 14.5 },
  endedDots: { fontSize: 20, color: '#17202B' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.45)', justifyContent: 'flex-end' },
  sheetCard: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: '82%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#17202B' },
  sheetClose: { backgroundColor: '#EEF1F6', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 14, color: '#17202B' },
  sheetRow: { backgroundColor: '#EEF1F6', borderRadius: 16, paddingHorizontal: 12, marginTop: 10 },
  sheetPresence: { position: 'absolute', right: 2, bottom: 2, width: 15, height: 15, borderRadius: 8, backgroundColor: '#22C55E', borderWidth: 2.5, borderColor: '#EEF1F6' },
  strip: { backgroundColor: '#EAFAF0', borderWidth: 1, borderColor: '#CDEEDA', borderRadius: 18, padding: 16, margin: 12, marginBottom: 4 },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stripDot: { width: 26, height: 26 },
  stripTitle: { fontSize: 16.5, fontWeight: '800', color: '#17202B', flexShrink: 1 },
  stripSeeAllWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stripFoot: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  stripSeeAll: { color: '#044FF1', fontWeight: '700', fontSize: 13 },
  stripSeeAllArrow: { width: 15, height: 15 },
  stripSub: { color: '#5D6B80', fontSize: 14.5, marginTop: 5, marginBottom: 14, marginLeft: 35 },
  stripRow: { gap: 12, paddingBottom: 4 },
  stripCard: { width: 198, backgroundColor: '#fff', borderRadius: 14, padding: 10, shadowColor: '#101828', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  stripPhotoWrap: { borderRadius: 10, overflow: 'hidden', aspectRatio: 1.6, backgroundColor: '#DFE5EE', position: 'relative' },
  stripPhoto: { width: '100%', height: '100%' },
  stripPill: { position: 'absolute', top: 8, right: 8, height: 20, width: 62 },
  stripDist: { color: '#1D9E4B', fontWeight: '700', fontSize: 13.5, marginTop: 9 },
  stripName: { fontSize: 16.5, fontWeight: '700', color: '#17202B', lineHeight: 21, marginTop: 2, minHeight: 42 },
  stripVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  stripPin: { width: 13, height: 13 },
  stripVenue: { color: '#5D6B80', fontSize: 13.5, flexShrink: 1 },
  stripPeople: { flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', rowGap: 4 },
  stripAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff', backgroundColor: '#DFE5EE' },
  stripAvatarOverlap: { marginLeft: -8 },
  stripInitials: { alignItems: 'center', justifyContent: 'center' },
  stripInitialsText: { fontSize: 11, fontWeight: '700', color: '#2C3C63' },
  stripMore: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#DFE5EE', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stripMoreText: { color: '#2C3C63', fontSize: 12, fontWeight: '700' },
  stripCountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  stripCountDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  stripCount: { color: '#1D9E4B', fontWeight: '700', fontSize: 14 },
  stripEndedAvatarWrap: { position: 'relative' },
  stripEndedBadge: { position: 'absolute', right: -2, bottom: -2, width: 14, height: 14 },
  stripEndedBlock: { alignSelf: 'center', maxWidth: '100%' },
  stripEndedPeople: { marginLeft: -4 },
  stripEndedTexts: { marginTop: 8 },
  stripEndedCount: { fontSize: 15, fontWeight: '700', color: '#14232E', textAlign: 'left' },
  stripEndedSub: { fontSize: 13, color: '#5B7186', marginTop: 2, textAlign: 'left' },
  stripEndedView: { color: '#2C5AA0', fontSize: 14, fontWeight: '600', marginTop: 6, textAlign: 'left' },
  personMenuWrap: { position: 'relative', zIndex: 50 },
  personMenuList: { position: 'absolute', right: -6, top: 34, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E8EF', borderRadius: 18, paddingVertical: 8, minWidth: 248, zIndex: 60, elevation: 8, shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 16 } },
  personMenuCaret: { position: 'absolute', top: -8, right: 17, width: 14, height: 14, backgroundColor: '#fff', borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#E3E8EF', transform: [{ rotate: '45deg' }] },
  livePersonMenuOpen: { zIndex: 60 },
  personMenuListLive: { position: 'absolute', left: -88, top: 72, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E8EF', borderRadius: 18, paddingVertical: 8, width: 248, zIndex: 60, elevation: 8, shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 16 } },
  personMenuCaretLive: { position: 'absolute', top: -8, left: 117, width: 14, height: 14, backgroundColor: '#fff', borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#E3E8EF', transform: [{ rotate: '45deg' }] },
  endedAvatarMenuList: { position: 'absolute', left: -4, top: 64, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E8EF', borderRadius: 18, paddingVertical: 8, width: 248, zIndex: 60, elevation: 8, shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 16 } },
  endedAvatarMenuCaret: { position: 'absolute', top: -8, left: 24, width: 14, height: 14, backgroundColor: '#fff', borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#E3E8EF', transform: [{ rotate: '45deg' }] },
  personMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 18 },
  personMenuItemDivider: { borderTopWidth: 1, borderTopColor: '#EDF0F4' },
  personMenuIcon: { width: 23, height: 23 },
  personMenuItemText: { fontSize: 16, fontWeight: '600', color: '#17202B' },
  livePerson: { alignItems: 'center', width: 72 },
  liveAvatarWrap: { position: 'relative' },
  liveAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#DFE5EE' },
  liveAvatarInitials: { alignItems: 'center', justifyContent: 'center' },
  liveAvatarInitialsText: { fontWeight: '700', color: '#2C3C63', fontSize: 20 },
  liveMore: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3EDFC' },
  liveMoreText: { fontWeight: '800', color: '#2C5AA0', fontSize: 18 },
  livePresence: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    borderWidth: 2.5,
    borderColor: '#EAFAF0',
  },
  livePersonName: { fontSize: 14, color: '#1C2733', fontWeight: '500', marginTop: 6 },
  liveChatBtn: {
    marginTop: 16,
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  liveChatIcon: { width: 21, height: 20 },
  liveChatText: { color: '#044FF1', fontWeight: '700', fontSize: 15.5 },
  // "Event listing with photos" (Angelo's mockup, Oct 27): recent
  // game-day photos + fans panel — mirrors web RecentPhotos.
  recentSection: { marginTop: 18 },
  recentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  recentTitle: { fontSize: 19, fontWeight: '800', color: '#17202B', textAlign: 'center' },
  recentPill: {
    backgroundColor: '#D9E8F8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 3,
  },
  recentPillText: {
    color: '#1E3A5F',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  recentSub: { marginTop: 5, marginBottom: 12, fontSize: 14.5, color: '#5B7186' },
  recentThumb: { width: 148, height: 112, borderRadius: 12 },
  recentThumbGap: { marginLeft: 10 },
  recentBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(18,27,41,0.87)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recentBadgeIcon: { width: 13, height: 13, tintColor: '#fff' },
  recentBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  recentMeta: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginTop: 10,
  },
  recentMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  recentMetaIcon: { width: 18, height: 18 },
  recentMetaText: { fontSize: 14.5, fontWeight: '600', color: '#17202B' },
  recentSee: { color: '#044FF1', fontWeight: '600', fontSize: 14.5 },
  recentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  // Angelo (Oct 27): the Add a photo button centers in the free space
  // left of the "See recent photos" label.
  recentAddWrap: { flex: 1, alignItems: 'center' },
  lbRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)' },
  lbImage: { width: '100%', height: '100%' },
  lbCounter: {
    position: 'absolute',
    top: 16,
    left: 20,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  lbClose: { position: 'absolute', top: 8, right: 12, padding: 8 },
  lbCloseText: { color: '#fff', fontSize: 34, lineHeight: 36 },
  lbFooter: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  lbCaption: { color: '#eee', fontSize: 14, marginBottom: 4, textAlign: 'center' },
  lbCredit: { color: '#eee', fontSize: 14, textAlign: 'center' },
  fansPanel: {
    backgroundColor: '#EDF3FA',
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
  },
  fansTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#17202B',
    marginBottom: 12,
    textAlign: 'center',
  },
  fansRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  fansAvatars: { flexDirection: 'row' },
  fansAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#DFE5EE',
  },
  fansAvatarOverlap: { marginLeft: -10 },
  fansInitials: { alignItems: 'center', justifyContent: 'center' },
  fansInitialsText: { fontSize: 13, fontWeight: '700', color: '#2C3C63' },
  fansText: { flex: 1, fontSize: 14.5, color: '#3D4F63' },
  checkinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 12,
  },
  checkinBtnOn: { backgroundColor: '#1D4ED8' },
  checkinBtnIcon: { width: 16, height: 16 },
  checkinBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
