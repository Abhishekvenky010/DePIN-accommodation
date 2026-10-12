"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from 'react';
import { API_BACKEND_URL } from '@/config';
import axios from 'axios';
import Link from 'next/link';
import Image from 'next/image';
import { Activity } from 'lucide-react';

interface Accommodation {
  id: string;
  title: string;
  description: string;
  city: string;
  pricePerNightPaise: number;
  maxGuests: number;
  imageUrl?: string;
  status: string;
}

interface AccommodationsResponse {
  accommodations: Accommodation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export default function AccommodationsPage() {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  useEffect(() => {
    fetchAccommodations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fetchAccommodations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<AccommodationsResponse>(
        `${API_BACKEND_URL}/api/v1/accommodations`,
        {
          params: {
            page,
            limit: 12, // Show 12 accommodations per page
          },
        }
      );
      setAccommodations(response.data.accommodations);
      setTotalPages(response.data.pagination.pages);
    } catch (err) {
      console.error('Error fetching accommodations:', err);
      setError('Failed to load accommodations. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      setPage(page + 1);
    }
  };

  if (loading && accommodations.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="text-center">
            <Activity className="h-12 w-12 text-indigo-500 dark:text-indigo-400 animate-spin mb-4" />
            <p className="text-lg text-gray-600 dark:text-gray-300">Loading accommodations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="text-center">
            <p className="text-xl text-red-500 dark:text-red-400 mb-4">{error}</p>
            <button 
              onClick={() => {
                setPage(1);
                fetchAccommodations();
              }}
              className="px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (accommodations.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="text-center space-y-6">
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              No accommodations available yet
            </p>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Check back later as hosts add their listings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-8">
        <div className="container mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-bold text-center text-gray-900 dark:text-white">
            Find Your Perfect Stay
          </h1>
          <p className="mt-4 text-center text-xl text-gray-600 dark:text-gray-300">
            Browse unique accommodations hosted by local residents
          </p>
        </div>
      </header>

      {/* Accommodations Grid */}
      <main className="container mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {accommodations.map((accommodation) => (
            <Link 
              key={accommodation.id} 
              href={`/accommodations/${accommodation.id}`}
              className="group"
            >
              <AccommodationCard accommodation={accommodation} />
            </Link>
          ))}
        </div>
      </main>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="container mx-auto px-6 py-8">
          <div className="flex justify-center items-center space-x-4">
            <button
              onClick={handlePreviousPage}
              disabled={page === 1}
              className={`
                px-4 py-2 rounded-md
                ${page === 1 
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600'
                }
              `}
            >
              Previous
            </button>

            <span className="text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={handleNextPage}
              disabled={page === totalPages}
              className={`
                px-4 py-2 rounded-md
                ${page === totalPages 
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600'
                }
              `}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <p className="text-gray-400">
              &copy; {new Date().getFullYear()} DePIN Accommodations. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface AccommodationCardProps {
  accommodation: Accommodation;
}

function AccommodationCard({ accommodation }: AccommodationCardProps) {
  const priceInRupees = (accommodation.pricePerNightPaise / 100).toFixed(2);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
      {/* Image */}
      <div className="relative h-48">
        {accommodation.imageUrl ? (
          <Image
            src={accommodation.imageUrl}
            alt={`${accommodation.title} image`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400 italic">No image</p>
          </div>
        )}
        <div className="absolute bottom-2 left-2 bg-white/90 dark:bg-gray-800/90 px-3 py-1 rounded-md text-sm">
          <span className="text-indigo-600 dark:text-indigo-400 font-medium">₹{priceInRupees}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
          {accommodation.title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
          {accommodation.city} • {accommodation.maxGuests} guests
        </p>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400 text-sm">
            ₹{priceInRupees}/night
          </span>
          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
            View Details
          </span>
        </div>
      </div>
    </div>
  );
}