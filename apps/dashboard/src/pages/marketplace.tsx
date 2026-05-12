'use client';

import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../lib/api';
import {
  Search,
  Download,
  Star,
  Filter,
  TrendingUp,
  Clock,
  Users,
  Heart,
  Share2,
  Plus,
  Tag,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string[];
  authorName: string;
  rating: number;
  installCount: number;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
}

interface Category {
  name: string;
  count: number;
}

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'recent'>('popular');
  const [isLoading, setIsLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    loadCategories();
  }, [searchQuery, selectedCategory, sortBy]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (selectedCategory) params.set('category', selectedCategory);
      params.set('sort', sortBy);

      const response = await api.get(`/marketplace/templates?${params.toString()}`);
      setTemplates(response.data.data.templates || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await api.get('/marketplace/categories');
      setCategories(response.data.data || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const installTemplate = async (templateId: string) => {
    setInstallingId(templateId);
    try {
      await api.post(`/marketplace/templates/${templateId}/install`, {
        createdBy: 'user',
      });
      alert('Template installed successfully!');
    } catch (error) {
      console.error('Failed to install template:', error);
      alert('Failed to install template');
    } finally {
      setInstallingId(null);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${star <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
        <span className="text-sm text-muted-foreground ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Agent Marketplace</h1>
        <p className="text-muted-foreground">
          Discover and install pre-built agent templates from the community
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[200px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.name} value={cat.name}>
                {cat.name} ({cat.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'popular' | 'rating' | 'recent')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Popular
              </div>
            </SelectItem>
            <SelectItem value="rating">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4" /> Top Rated
              </div>
            </SelectItem>
            <SelectItem value="recent">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" /> Recent
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Categories Pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={selectedCategory === '' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory('')}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.name}
            variant={selectedCategory === cat.name ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(cat.name)}
          >
            <Tag className="w-3 h-3 mr-1" />
            {cat.name}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : templates.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-muted-foreground">No templates found</p>
            <p className="text-sm text-muted-foreground mt-2">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">by {template.authorName}</p>
                  </div>
                  <Badge variant="secondary">{template.category[0] || 'General'}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4 line-clamp-2">
                  {template.description || 'No description provided'}
                </CardDescription>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {(template.tags || []).slice(0, 3).map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {(template.tags || []).length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{template.tags.length - 3}
                    </Badge>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between mb-4">
                  {renderStars(template.rating)}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {template.installCount}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    size="sm"
                    onClick={() => installTemplate(template.id)}
                    disabled={installingId === template.id}
                  >
                    {installingId === template.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Install
                  </Button>
                  <Button variant="outline" size="sm">
                    <Heart className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* My Templates Section */}
      <Tabs defaultValue="browse" className="mt-12">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="my-templates">My Templates</TabsTrigger>
          <TabsTrigger value="create">Create Template</TabsTrigger>
        </TabsList>

        <TabsContent value="my-templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Your Templates</CardTitle>
              <CardDescription>Templates you have created or forked</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="mb-4">
                <Plus className="w-4 h-4 mr-2" />
                Create New Template
              </Button>
              <p className="text-muted-foreground text-sm">No templates created yet</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Template</CardTitle>
              <CardDescription>Turn an existing agent into a shareable template</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Agent to convert</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent-1">Research Assistant</SelectItem>
                    <SelectItem value="agent-2">Code Reviewer</SelectItem>
                    <SelectItem value="agent-3">Customer Support</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Template Name</label>
                <Input placeholder="Enter template name" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Description</label>
                <Input placeholder="Brief description of what this template does" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Category</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coding">Coding</SelectItem>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="support">Customer Support</SelectItem>
                    <SelectItem value="creative">Creative</SelectItem>
                    <SelectItem value="productivity">Productivity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button>Create Template</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}