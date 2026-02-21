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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Calendar } from "lucide-react";
import { useEffect } from "react";

const createLeagueSchema = z.object({
  name: z.string().min(1, "League name is required"),
  type: z.enum(["Redraft", "Best Ball"]),
  numberOfTeams: z.coerce.number().min(2, "Minimum 2 teams").max(12, "Maximum 12 teams"),
  scoringFormat: z.enum(["Roto", "H2H Points", "H2H Each Category", "H2H Most Categories", "Season Points"]),
  isPublic: z.boolean(),
  draftDate: z.string().optional(),
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
      type: "Best Ball",
      numberOfTeams: 12,
      scoringFormat: "Roto",
      isPublic: true,
      draftDate: "",
    },
  });

  const createLeagueMutation = useMutation({
    mutationFn: async (data: CreateLeagueForm) => {
      const leagueData = {
        ...data,
        createdBy: user?.id,
        maxTeams: data.numberOfTeams,
        draftDate: data.draftDate || null,
      };
      const response = await apiRequest("POST", "/api/leagues", leagueData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/user"] });
      setLocation("/teams");
    },
    onError: (error) => {
    },
  });

  const watchType = form.watch("type");
  const isBestBall = watchType === "Best Ball";

  const currentScoringFormat = form.watch("scoringFormat");
  useEffect(() => {
    if (isBestBall && currentScoringFormat !== "Roto" && currentScoringFormat !== "Season Points") {
      form.setValue("scoringFormat", "Roto");
    }
  }, [isBestBall, currentScoringFormat, form]);

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

            {/* League Type (Hidden - Best Ball only) */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <RadioGroupItem value="Best Ball" />
                    </RadioGroup>
                  </FormControl>
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
                  <Select
                    value={String(field.value)}
                    onValueChange={(val) => field.onChange(parseInt(val))}
                  >
                    <FormControl>
                      <SelectTrigger className="sleeper-card-bg sleeper-border border text-white">
                        <SelectValue placeholder="Select number of teams" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="sleeper-card-bg sleeper-border border text-white">
                      {Array.from({ length: 11 }, (_, i) => i + 2).map((num) => (
                        <SelectItem key={num} value={String(num)} className="text-white">
                          {num} Teams
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                              {isBestBall
                                ? "Each category gets its own optimal lineup at season end"
                                : "Traditional rotisserie scoring"}
                            </div>
                          </div>
                        </Label>
                      </div>
                      {!isBestBall && (
                        <>
                          <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                            <RadioGroupItem value="H2H Points" id="h2h-points" className="text-blue-400" />
                            <Label htmlFor="h2h-points" className="text-white cursor-pointer flex-1">
                              <div>
                                <div className="font-medium">Head to Head Points</div>
                                <div className="text-sm text-gray-400">Weekly matchups, winner by total fantasy points</div>
                              </div>
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                            <RadioGroupItem value="H2H Each Category" id="h2h-each" className="text-blue-400" />
                            <Label htmlFor="h2h-each" className="text-white cursor-pointer flex-1">
                              <div>
                                <div className="font-medium">Head to Head Each Category</div>
                                <div className="text-sm text-gray-400">Weekly matchups, compare each stat category individually</div>
                              </div>
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                            <RadioGroupItem value="H2H Most Categories" id="h2h-most" className="text-blue-400" />
                            <Label htmlFor="h2h-most" className="text-white cursor-pointer flex-1">
                              <div>
                                <div className="font-medium">Head to Head Most Categories</div>
                                <div className="text-sm text-gray-400">Weekly matchups, team that wins more categories gets the win</div>
                              </div>
                            </Label>
                          </div>
                        </>
                      )}
                      <div className="flex items-center space-x-3 p-4 rounded-lg sleeper-card-bg border sleeper-border">
                        <RadioGroupItem value="Season Points" id="season-points" className="text-blue-400" />
                        <Label htmlFor="season-points" className="text-white cursor-pointer flex-1">
                          <div>
                            <div className="font-medium">Season Points</div>
                            <div className="text-sm text-gray-400">
                              {isBestBall
                                ? "Single optimal lineup calculated for the entire season at year end"
                                : "No matchups, ranked by total cumulative fantasy points"}
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

            {/* Draft Date & Time */}
            <FormField
              control={form.control}
              name="draftDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Draft Date & Time</FormLabel>
                  <FormControl>
                    <div
                      className="relative cursor-pointer"
                      onClick={(e) => {
                        const input = (e.currentTarget as HTMLElement).querySelector("input");
                        if (input) { input.showPicker(); input.focus(); }
                      }}
                    >
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <Input
                        type="datetime-local"
                        className="sleeper-card-bg sleeper-border border text-white pl-10 cursor-pointer"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <p className="text-gray-500 text-xs mt-1">
                    The draft will automatically start at this time. Leave blank to start manually.
                  </p>
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