import React, { useState } from 'react';
import { AniListAnime } from '../../types/types';
import useAniList from '../hooks/useAniList';
import Spinner from '../components/ui/Spinner';

interface OraclePageProps {
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

export default function OraclePage({ onSelectAnime }: OraclePageProps) {
  const { searchAnime } = useAniList();
  const [selectedGenre, setSelectedGenre] = useState<string>('Action');
  const [loading, setLoading] = useState(false);
  const [resultAnimes, setResultAnimes] = useState<AniListAnime[]>([]);

  const handleLuckyPick = async () => {
    setLoading(true);
    try {
      // Pick a random page between 1 and 5
      const randomPage = Math.floor(Math.random() * 5) + 1;
      
      const data = await searchAnime('', randomPage, 50, [selectedGenre]);
      
      if (data && data.length > 0) {
        // Shuffle the array and pick the first 5
        const shuffled = [...data].sort(() => 0.5 - Math.random());
        setResultAnimes(shuffled.slice(0, Math.min(5, shuffled.length)));
      } else {
        // If the random page went out of bounds (which shouldn't happen for popular genres but can for rare ones)
        const fallbackData = await searchAnime('', 1, 50, [selectedGenre]);
        if (fallbackData && fallbackData.length > 0) {
          const shuffled = [...fallbackData].sort(() => 0.5 - Math.random());
          setResultAnimes(shuffled.slice(0, Math.min(5, shuffled.length)));
        } else {
          setResultAnimes([]);
        }
      }
    } catch (err) {
      console.error('[OraclePage] Error generating lucky pick:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full flex flex-col justify-center items-center px-8 text-center pb-12 overflow-hidden -mt-6">
      <style>{`
        .oracle-glow {
          box-shadow: 0 0 40px 10px rgba(203, 151, 255, 0.2);
        }
        .btn-glow:hover {
          box-shadow: 0 0 30px 5px rgba(203, 151, 255, 0.4);
        }
      `}</style>
      
      {/* Background Image Overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none rounded-2xl overflow-hidden mx-[-24px]">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent z-10" />
        <div className="absolute inset-0 bg-background/50 z-10" />
        <img 
          alt="Cyberpunk street" 
          className="w-full h-full object-cover filter grayscale contrast-125 opacity-40 mix-blend-screen" 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDzvwtMVQtMtWuj_XqTCQcl8NvSiEfOf3SJ0fJfqo5C9fbbdX7JC-qpDNTfSnnLD6GF3qmkNJ0MNUr4Tn5FAY8iRbKid8CgSBQ-wFydu4DaJn_jyycQfCra6a2-8WlgxLmq8Q0RHnvC_D1E7gB-FdvBZmNFwlqxv3eQXbrBpB9Oj745BvH0xSQJU8kT545hwJPtC25lB9CsTIXExfwlfEAttbDisGJ-v8F4lCEw1yBvS9DMRw4M78_ebf4krA--YVuFDYq6eGjnDh4v"
        />
      </div>

      <div className="relative z-20 max-w-4xl space-y-8 mt-12">
        <div className="space-y-4">
          <span className="text-secondary font-label uppercase tracking-[0.4em] text-sm font-bold block mb-4">
            El Curador Digital
          </span>
          <h1 className="font-headline text-6xl md:text-7xl font-extrabold tracking-tight text-on-surface">
            KAGEVIEW <br/> 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary filter drop-shadow-[0_0_15px_rgba(203,151,255,0.4)]">
              ORÁCULO
            </span>
          </h1>
          <p className="font-body text-on-surface-variant text-lg md:text-xl mt-6 max-w-2xl mx-auto">
            Deja que las sombras decidan tu próximo viaje. Sintoniza una frecuencia y descubre joyas ocultas del archivo.
          </p>
        </div>

        {/* Genre Selector */}
        <div className="pt-8">
          <p className="text-sm text-on-surface-variant font-label uppercase tracking-widest mb-4">Sintonizando Frecuencia</p>
          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
            {GENRES.map(genre => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`
                  px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 border
                  ${selectedGenre === genre 
                    ? 'bg-primary/20 text-primary border-primary shadow-[0_0_15px_rgba(203,151,255,0.3)] scale-105' 
                    : 'bg-surface-variant/40 text-on-surface-variant border-transparent hover:border-on-surface-variant/30 hover:bg-surface-variant'
                  }
                `}
              >
                {GENRE_I18N[genre] || genre}
              </button>
            ))}
          </div>
        </div>

        {/* Central Action */}
        <div className="pt-8 relative flex justify-center">
          <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-40 mix-blend-screen pointer-events-none" />
          <button 
            className="
              relative group bg-gradient-to-r from-primary to-secondary text-white px-10 py-5 rounded-full 
              font-headline text-base font-black tracking-[0.2em] flex items-center justify-center gap-3 
              transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] oracle-glow btn-glow
              disabled:opacity-70 disabled:scale-100 disabled:cursor-not-allowed
            "
            onClick={handleLuckyPick}
            disabled={loading}
          >
            {loading ? (
              <Spinner size={24} className="text-white" />
            ) : (
              <span className="material-symbols-outlined text-[28px]">flare</span>
            )}
            {loading ? 'SINTONIZANDO...' : 'SINTONIZAR AL AZAR'}
          </button>
        </div>

        {/* Result Area */}
        <div className="mt-16 flex flex-col items-center justify-center min-h-[300px]">
          {loading ? (
            <div className="flex items-center gap-3 text-on-surface-variant/60">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-xs font-label uppercase tracking-widest">Escaneando los archivos...</span>
            </div>
          ) : resultAnimes.length > 0 ? (
            <div className="animate-fade-in-scale flex flex-col items-center w-full">
              <p className="text-primary text-xs font-bold tracking-[0.3em] uppercase mb-6">Tu Destino Múltiple</p>
              
              <div className="flex flex-wrap justify-center gap-6 w-full max-w-[900px]">
                {resultAnimes.map((anime) => (
                  <button 
                    key={anime.id}
                    className="relative group focus:outline-none transition-transform duration-500 hover:scale-105"
                    onClick={() => onSelectAnime(anime)}
                  >
                    <div className="absolute -inset-2 bg-gradient-to-tr from-primary/30 to-secondary/30 rounded-2xl blur-xl opacity-40 group-hover:opacity-100 transition-opacity" />
                    <div className="relative w-[150px] h-[220px] bg-surface-container rounded-xl overflow-hidden shadow-2xl border border-white/5">
                      <img 
                        src={anime.coverImage.extraLarge || anime.coverImage.large}
                        alt={anime.title.romaji}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                      <div className="absolute bottom-3 left-3 right-3 text-left">
                        <p className="font-headline text-xs font-bold text-white line-clamp-2 leading-tight">
                          {anime.title.english || anime.title.romaji}
                        </p>
                        {anime.averageScore && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="material-symbols-outlined filled text-primary text-[12px]">star</span>
                            <span className="text-[10px] text-white/90 font-medium">{(anime.averageScore / 10).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
                          <span className="material-symbols-outlined text-white text-2xl ml-0.5">play_arrow</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative w-[150px] h-[220px] bg-surface-container/50 rounded-xl overflow-hidden shadow-xl flex items-center justify-center border border-white/[0.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-surface-container-highest/20 to-surface-container-lowest/20" />
                <span className="material-symbols-outlined text-primary/20 text-6xl">question_mark</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
