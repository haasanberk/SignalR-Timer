using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Threading.Tasks;

namespace SignalR_Timer.Hubs;

public class RandomNameHub : Hub
{
    private static ConcurrentDictionary<string, string> activeConnections = new ConcurrentDictionary<string, string>();

    public Task<string> NotifyConnectionEstablished()
    {
        var connectionId = Context.ConnectionId;
        Console.WriteLine($"Connection established with ID: {connectionId}");
        activeConnections[connectionId] = connectionId;
        return Task.FromResult(connectionId);
    }

    public Task NotifyDisconnection(string connectionId)
    {
        Console.WriteLine($"Connection lost for ID: {connectionId}");
        activeConnections.TryRemove(connectionId, out _);
        return Task.CompletedTask;
    }

    public Task NotifyReconnection(string oldConnectionId, string newConnectionId)
    {
        Console.WriteLine($"Reconnection: old ID = {oldConnectionId}, new ID = {newConnectionId}");
        
        if (!string.IsNullOrEmpty(oldConnectionId))
        {
            activeConnections.TryRemove(oldConnectionId, out _);
        }
        
        activeConnections[newConnectionId] = newConnectionId;
        return Task.CompletedTask;
    }

    public async Task SendNewName()
    {
        var newName = GenerateRandomName();
        Console.WriteLine($"Attempting to send new name: {newName}");

        foreach (var connectionId in activeConnections.Keys)
        {
            try
            {
                var client = Clients.Client(connectionId);
                if (client != null)
                {
                    await client.SendAsync("ReceiveNewName", newName);
                    Console.WriteLine($"Sent name: {newName} to connection ID: {connectionId}");
                }
                else
                {
                    Console.WriteLine($"Connection ID: {connectionId} is no longer valid, removing from active connections.");
                    activeConnections.TryRemove(connectionId, out _);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send name: {newName} to connection ID: {connectionId}. Error: {ex.Message}");
            }
        }
    }

    private string GenerateRandomName()
    {
        var names = new[] { "Alice", "Bob", "Charlie", "Diana" };
        var random = new Random();
        return names[random.Next(names.Length)];
    }

    public static Task StopNameUpdates()
    {
        Console.WriteLine("Stopping name updates.");
        return Task.CompletedTask;
    }
} 