import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Settings } from "lucide-react";

import Page from "../components/Page";
import AppHeader from "../components/AppHeader";
import IconButton from "../components/IconButton";
import Button from "../components/Button";
import ProfileHeader, { ProfileHeaderSkeleton } from "../components/ProfileHeader";
import ErrorCard from "../components/ErrorCard";
import VideoCard from "../components/results/VideoCard";
import PreviewSheet from "../components/results/PreviewSheet";
import ActionBar from "../components/results/ActionBar";
import useZipJob from "../hooks/useZipJob";
import { fetchBatch } from "../lib/api";
import { saveRecent } from "../lib/recent";

const BATCH = 50;

function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    setSeconds(0);
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

export default function Results() {
  const { username } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({ status: "loading", error: null });
  const [attempt, setAttempt] = useState(0);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState({ loading: false, error: null });
  const [selected, setSelected] = useState(() => new Set());
  const [preview, setPreview] = useState(null);

  const zip = useZipJob();
  const elapsed = useElapsed(state.status === "loading" || more.loading);

  // First batch
  useEffect(() => {
    let ignore = false;
    setState({ status: "loading", error: null });
    setSelected(new Set());

    fetchBatch(username, 0)
      .then((data) => {
        if (ignore) return;
        setProfile(data.profile);
        setItems(data.items);
        setNextOffset(data.next_offset);
        setHasMore(data.has_more);
        setState({ status: "ready", error: null });
        saveRecent({
          username,
          fullName: data.profile?.full_name || "",
          avatar: data.profile?.avatar || "",
          thumbs: data.items.map((item) => item.thumb).filter(Boolean).slice(0, 7),
        });
      })
      .catch((error) => {
        if (!ignore) setState({ status: "error", error });
      });

    return () => {
      ignore = true;
    };
  }, [username, attempt]);

  const loadMore = async () => {
    if (more.loading || !hasMore) return;
    setMore({ loading: true, error: null });
    try {
      const data = await fetchBatch(username, nextOffset);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.items.filter((i) => !seen.has(i.id))];
      });
      setNextOffset(data.next_offset);
      setHasMore(data.has_more);
      setMore({ loading: false, error: null });
    } catch (error) {
      setMore({ loading: false, error });
    }
  };

  // A finished (or failed) download resets as soon as the selection changes
  const { reset: resetZip } = zip;
  const zipFinishedRef = useRef(false);
  useEffect(() => {
    zipFinishedRef.current = zip.status === "done" || zip.status === "error";
  }, [zip.status]);

  const toggle = useCallback(
    (id) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (zipFinishedRef.current) resetZip();
    },
    [resetZip]
  );

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
    if (zipFinishedRef.current) resetZip();
  };

  const onDownload = () => {
    if (zip.status === "working" || zip.status === "starting") return;
    if (zip.status === "done") {
      resetZip();
      return;
    }
    const chosen = selected.size ? items.filter((i) => selected.has(i.id)) : items;
    if (chosen.length) zip.start(username, chosen);
  };

  const openPreview = useCallback((item) => setPreview(item), []);
  const closePreview = useCallback(() => setPreview(null), []);

  const { status, error } = state;

  return (
    <Page>
      <AppHeader
        left={
          <IconButton label="Back" onClick={() => navigate("/")}>
            <ChevronLeft size={24} />
          </IconButton>
        }
        right={
          <IconButton to="/settings" label="Settings">
            <Settings size={20} strokeWidth={1.8} />
          </IconButton>
        }
      />

      <div className="mt-2">
        {status === "loading" && (
          <>
            <ProfileHeaderSkeleton />
            <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-muted uppercase" aria-live="polite">
              Fetching the latest videos · {elapsed}s{" "}
              <span className="text-muted/70">(about 30s)</span>
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="skeleton aspect-[9/16] rounded-thumb" />
              ))}
            </div>
          </>
        )}

        {status === "error" && (
          <div className="mt-4">
            <ErrorCard
              error={error}
              onRetry={() => setAttempt((a) => a + 1)}
              onSettings={() => navigate("/settings")}
              onBack={() => navigate("/")}
            />
          </div>
        )}

        {status === "ready" && profile && (
          <>
            <ProfileHeader profile={profile} count={items.length} hasMore={hasMore} />

            {items.length === 0 ? (
              <p className="mt-10 text-center font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
                No videos found on this profile
              </p>
            ) : (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
                {items.map((item, index) => (
                  <VideoCard
                    key={item.id}
                    item={item}
                    index={index}
                    selected={selected.has(item.id)}
                    onToggle={toggle}
                    onPreview={openPreview}
                    delay={Math.min((index % BATCH) * 0.025, 0.5)}
                  />
                ))}
              </ul>
            )}

            <div className="mt-10 flex flex-col items-center gap-3 border-t border-hairline pt-6">
              {hasMore ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={loadMore}
                    disabled={more.loading}
                    className="min-h-12 px-7"
                  >
                    {more.loading ? `Fetching · ${elapsed}s` : `Load ${BATCH} more`}
                  </Button>
                  {more.error && (
                    <p className="text-center font-mono text-xs text-accent">{more.error.message}</p>
                  )}
                </>
              ) : (
                <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
                  End of profile · {items.length} videos
                </p>
              )}
            </div>

            {/* Space so the fixed action bar never covers content */}
            <div className="h-40" />

            <ActionBar
              zip={zip}
              selectedCount={selected.size}
              totalCount={items.length}
              allSelected={allSelected}
              onToggleAll={toggleAll}
              onDownload={onDownload}
            />

            <PreviewSheet
              item={preview}
              index={preview ? items.indexOf(preview) : 0}
              selected={preview ? selected.has(preview.id) : false}
              onToggle={() => preview && toggle(preview.id)}
              onClose={closePreview}
            />
          </>
        )}
      </div>
    </Page>
  );
}