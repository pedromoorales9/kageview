import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AniListAnime } from '../../types/types';
import useAniList from '../hooks/useAniList';
import AnimeCard from '../components/anime/AnimeCard';
import Chip from '../components/ui/Chip';
import Spinner from '../components/ui/Spinner';

interface SearchPageProps {
  onSelectAnime: (anime: AniListAnime) => void;
}

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mecha', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller',
  'Sports', 'Slice of Life', 'Supernatural', 'Music',
];

const GENRE_I18N: Record<string, string> = {
  Action: 'Acción', Adventure: 'Aventura', Comedy: 'Comedia', Drama: 'Drama',
  Fantasy: 'Fantasía', Horror: 'Terror', Mecha: 'Mecha', Mystery: 'Misterio',
  Romance: 'Romance', 'Sci-Fi': 'Ciencia Ficción', Thriller: 'Suspense',
  Sports: 'Deportes', 'Slice of Life': 'Recuentos de la Vida', 
  Supernatural: 'Sobrenatural', Music: 'Música',
};

export default function SearchPage({ onSelectAnime }: SearchPageProps) {
  const { searchAnime, getSeasonal } = useAniList();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AniListAnime[]>([]);
  const [popularSeason, setPopularSeason] = useState<AniListAnime[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Cargar "Popular this season" al montar
  useEffect(() => {
    let cancelled = false;

    function getCurrentSeason(): { season: string; year: number } {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      if (month <= 3) return { season: 'WINTER', year };
      if (month <= 6) return { season: 'SPRING', year };
      if (month <= 9) return { season: 'SUMMER', year };
      return { season: 'FALL', year };
    }

    async function load() {
      try {
        const { season, year } = getCurrentSeason();
        const data = await getSeasonal(season, year, 1, 20);
        if (!cancelled) setPopularSeason(data);
      } catch (err) {
        console.error('[SearchPage] Error loading seasonal:', err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [getSeasonal]);

  // Búsqueda con debounce de 400ms
  const performSearch = useCallback(
    async (searchQuery: string, genres: string[]) => {
      if (!searchQuery.trim() && genres.length === 0) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      setLoading(true);
      setHasSearched(true);
      try {
        const data = await searchAnime(searchQuery || '', 1, 25, genres);
        setResults(data);
      } catch (err) {
        console.error('[SearchPage] Search error:', err);
      } finally {
        setLoading(false);
      }
    },
    [searchAnime]
  );

  // Debounce del input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      performSearch(query, selectedGenres);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedGenres, performSearch]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
    );
  };

  const displayResults = hasSearched ? results : popularSeason;
  const sectionTitle = hasSearched ? 'Resultados de Búsqueda' : 'Populares en esta Temporada';

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8">
      {/* Search Input */}
      <div className="relative mb-5">
        <span className="
          absolute left-4 top-1/2 -translate-y-1/2
          material-symbols-outlined text-xl text-on-surface-variant
        ">
          search
        </span>
        <input
          id="search-input"
          type="text"
          placeholder="Search anime..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="
            w-full pl-12 pr-4 py-3.5
            bg-surface-container-low rounded-xl
            text-on-surface text-sm font-body
            border-b-2 border-transparent focus:border-primary
            outline-none
            placeholder:text-on-surface-variant/50
            transition-colors duration-200
          "
        />
      </div>

      {/* Genre Chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {GENRES.map((genre) => (
          <Chip
            key={genre}
            selected={selectedGenres.includes(genre)}
            onClick={() => toggleGenre(genre)}
          >
            {GENRE_I18N[genre] || genre}
          </Chip>
        ))}
      </div>

      {/* Section Title */}
      <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
        {sectionTitle}
      </h2>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={32} />
        </div>
      ) : displayResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3">
          <span className="material-symbols-outlined text-4xl opacity-40">
            search_off
          </span>
          <p className="text-sm">No se encontraron resultados</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          {displayResults.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onClick={() => onSelectAnime(anime)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
