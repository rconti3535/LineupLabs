import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft } from "lucide-react";

const createLeagueSchema = z.object({
  name: z.string().min(1, "League name is required"),
  type: z.enum(["Redraft"]),
  numberOfTeams: z.number().min(4, "Minimum 4 teams").max(30, "Maximum 30 teams"),
  scoringFormat: z.enum(["Roto"]),
  isPublic: z.boolean(),
});

type CreateLeagueForm = z.infer<typeof createLeagueSchema>;

export default function CreateLeague() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<CreateLeagueForm>({
    resolver: zodResolver(createLeagueSchema),
    defaultValues: {
      name: "",
      type: "Redraft",
      numberOfTeams: 12,
      scoringFormat: "Roto",
      isPublic: false,
    },
  });

  const createLeagueMutation = useMutation({
    mutationFn: async (data: CreateLeagueForm) => {
      const leagueData = {
        ...data,
        createdBy: user?.id,
        maxTeams: data.numberOfTeams,
      };
      const response = await apiRequest("POST", "/api/leagues", leagueData);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "League Created!",
        description: "Your fantasy baseball league has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/user"] });
      setLocation("/teams");
    },
    onError: (error) => {
      toast({
        title: "Failed to create league",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateLeagueForm) => {
    createLeagueMutation.mutate(data);
  };

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mb-6">
        <Button
          onClick={() => setLocation("/")}
          variant="ghost"
          className="text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
        
        <h1 className="text-2xl font-bold text-white mb-2">Create League</h1>
        <p className="text-gray-400">Set up your fantasy baseball league</p>
      </div>

      <Card className="gradient-card rounded-xl p-6 border-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* League Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">League Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter your league name"
                      className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* League Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">League Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                        <RadioGroupItem value="Redraft" id="redraft" className="text-blue-400" />
                        <Label htmlFor="redraft" className="text-white cursor-pointer flex-1">
                          <div>
                            <div className="font-medium">Redraft</div>
                            <div className="text-sm text-gray-400">
                              Draft new teams each season
                            </div>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Number of Teams */}
            <FormField
              control={form.control}
              name="numberOfTeams"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Number of Teams</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="6"
                      max="30"
                      placeholder="12"
                      className="sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 12)}
                    />
                  </FormControl>
                  <div className="text-sm text-gray-400 mt-2">
                    Choose between 6 and 30 teams
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Scoring Format */}
            <FormField
              control={form.control}
              name="scoringFormat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Scoring Format</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                        <RadioGroupItem value="Roto" id="roto" className="text-blue-400" />
                        <Label htmlFor="roto" className="text-white cursor-pointer flex-1">
                          <div>
                            <div className="font-medium">Roto</div>
                            <div className="text-sm text-gray-400">
                              Traditional rotisserie scoring
                            </div>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Visibility */}
            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">League Visibility</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(val) => field.onChange(val === "public")}
                      defaultValue={field.value ? "public" : "private"}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                        <RadioGroupItem value="public" id="public" className="text-blue-400" />
                        <Label htmlFor="public" className="text-white cursor-pointer flex-1">
                          <div>
                            <div className="font-medium">Public</div>
                            <div className="text-sm text-gray-400">
                              Anyone can find and join your league
                            </div>
                          </div>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                        <RadioGroupItem value="private" id="private" className="text-blue-400" />
                        <Label htmlFor="private" className="text-white cursor-pointer flex-1">
                          <div>
                            <div className="font-medium">Private</div>
                            <div className="text-sm text-gray-400">
                              Only people you invite can join
                            </div>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={createLeagueMutation.isPending}
              className="w-full primary-gradient hover:opacity-90 rounded-xl py-3 text-white font-medium"
            >
              {createLeagueMutation.isPending ? "Creating League..." : "Create League"}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}