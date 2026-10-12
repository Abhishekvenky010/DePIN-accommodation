"use client";

export const dynamic = "force-dynamic";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BACKEND_URL } from '@/config';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import {
  GatedSignedOut,
  GatedSignInButton,
} from '@/components/clerk/gated-components';

interface AccommodationFormData {
  title: string;
  description: string;
  city: string;
  pricePerNight: number; // in INR
  maxGuests: number;
  imageUrl: string;
}

export default function NewAccommodationPage() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  
  // Form state
  const [formData, setFormData] = useState<AccommodationFormData>({
    title: '',
    description: '',
    city: '',
    pricePerNight: 0,
    maxGuests: 1,
    imageUrl: '',
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Validation
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }
    
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }
    
    if (!formData.city.trim()) {
      errors.city = 'City is required';
    }
    
    if (formData.pricePerNight <= 0) {
      errors.pricePerNight = 'Price must be greater than 0';
    }
    
    if (formData.maxGuests < 1) {
      errors.maxGuests = 'Maximum guests must be at least 1';
    }
    
    if (formData.imageUrl && !formData.imageUrl.startsWith('http')) {
      errors.imageUrl = 'Please enter a valid URL starting with http:// or https://';
    }
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }
    
    setLoading(true);
    setError(null);
    setFieldErrors({});
    setSuccess(false);
    
    try {
      const token = await getToken();
      
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }
      
      // Convert INR to paise (multiply by 100)
      const pricePerNightPaise = Math.round(formData.pricePerNight * 100);
      
      const response = await axios.post(
        `${API_BACKEND_URL}/api/v1/accommodations`,
        {
          title: formData.title.trim(),
          description: formData.description.trim(),
          city: formData.city.trim(),
          pricePerNightPaise,
          maxGuests: formData.maxGuests,
          imageUrl: formData.imageUrl.trim() || undefined,
        },
        {
          headers: {
            Authorization: token,
          },
        }
      );
      
      const { id } = response.data;
      setSuccess(true);
      
      // Navigate to the newly created listing
      setTimeout(() => {
        router.push(`/accommodations/${id}`);
      }, 1500);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('Error creating accommodation:', err);
      if (err.response?.status === 401) {
        setError('Authentication failed. Please sign in.');
      } else if (err.response?.status === 400) {
        setError(err.response.data.error || 'Validation failed');
        // Handle field-specific errors if API returns them
        if (err.response.data.fieldErrors) {
          setFieldErrors(err.response.data.fieldErrors);
        }
      } else if (err.response?.status === 403) {
        setError('You do not have permission to create listings');
      } else {
        setError('Failed to create listing. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white">
              List Your Space
            </h1>
            <p className="mt-4 text-center text-gray-600 dark:text-gray-300">
              Share your extra room, apartment, or property and earn extra income
            </p>
          </header>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            {/* Success Message */}
            {success && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                  Listing created successfully!
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Redirecting to your new listing...
                </p>
              </div>
            )}
            
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            
            {/* Auth Check */}
            {!userId && (
              <GatedSignedOut>
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    You need to sign in to create a listing
                  </p>
                  <GatedSignInButton><button className="px-4 py-2 bg-indigo-600 text-white rounded-md">Sign in</button></GatedSignInButton>
                </div>
              </GatedSignedOut>
            )}
            
            {/* Form */}
            {userId && (
              <>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      className={`w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        fieldErrors.title ? 'border-red-500 dark:border-red-400' : ''
                      }`}
                      placeholder="Cozy cottage in the hills"
                    />
                    {fieldErrors.title && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.title}</p>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className={`w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-y ${
                        fieldErrors.description ? 'border-red-500 dark:border-red-400' : ''
                      }`}
                      placeholder="Describe your space, amenities, and what makes it special..."
                    />
                    {fieldErrors.description && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.description}</p>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      className={`w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        fieldErrors.city ? 'border-red-500 dark:border-red-400' : ''
                      }`}
                      placeholder="Jaipur, Rajasthan"
                    />
                    {fieldErrors.city && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.city}</p>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Price per night (₹)
                    </label>
                    <div className="flex items-center">
                      <span className="mr-2 text-gray-600 dark:text-gray-300">₹</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={formData.pricePerNight}
                        onChange={(e) => setFormData(prev => ({ ...prev, pricePerNight: parseFloat(e.target.value) || 0 }))}
                        className={`rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32 ${
                          fieldErrors.pricePerNight ? 'border-red-500 dark:border-red-400' : ''
                        }`}
                        placeholder="1200"
                      />
                    </div>
                    {fieldErrors.pricePerNight && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.pricePerNight}</p>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Maximum guests
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formData.maxGuests}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxGuests: parseInt(e.target.value) || 1 }))}
                      className={`rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-24 ${
                        fieldErrors.maxGuests ? 'border-red-500 dark:border-red-400' : ''
                      }`}
                    />
                    {fieldErrors.maxGuests && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.maxGuests}</p>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Image URL (optional)
                    </label>
                    <input
                      type="text"
                      value={formData.imageUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                      className={`w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        fieldErrors.imageUrl ? 'border-red-500 dark:border-red-400' : ''
                      }`}
                      placeholder="https://example.com/image.jpg"
                    />
                    {fieldErrors.imageUrl && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.imageUrl}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button
                      type="submit"
                      disabled={loading}
                      className={`w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors`}
                    >
                      {loading ? 'Creating listing...' : 'Publish Listing'}
                    </button>
                    <Link
                      href="/"
                      className="text-sm text-gray-600 dark:text-gray-300 hover:underline"
                    >
                      Back to home
                    </Link>
                  </div>
                </form>
              </>
            )}
          </div>
          
          <footer className="mt-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            <p>
              By listing your space, you agree to our <a href="#" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                Terms of Service
              </a> and <a href="#" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                Privacy Policy
              </a>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}