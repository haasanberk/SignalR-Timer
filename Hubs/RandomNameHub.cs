using Microsoft.AspNetCore.SignalR;
using System.Timers;

namespace SignalR_Timer.Hubs;

public class RandomNameHub : Hub
{
    private static readonly string[] Names = new[]
    {
        "Alice", "Bob", "Charlie", "David", "Eve", 
        "Frank", "Grace", "Henry", "Ivy", "Jack"
    };
    private static readonly Random _random = new Random();
    private readonly IHubContext<RandomNameHub> _hubContext;
    private static System.Timers.Timer? _nameUpdateTimer;
    private static readonly object _timerLock = new object();
    private static readonly Queue<string> _pendingNames = new Queue<string>();
    private static readonly Dictionary<string, DateTime> _activeConnections = new();
    private const int CONNECTION_TIMEOUT_MINUTES = 5;

    public RandomNameHub(IHubContext<RandomNameHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public override async Task OnConnectedAsync()
    {
        var connectionId = Context.ConnectionId;
        string initialName;

        lock (_timerLock)
        {
            _activeConnections[connectionId] = DateTime.UtcNow;
            initialName = Names[_random.Next(Names.Length)];
            
            // Start timer when first client connects
            if (_nameUpdateTimer == null)
            {
                StartNameUpdates();
            }
        }

        await Clients.Caller.SendAsync("Connected", "Connection established");
        await Clients.Caller.SendAsync("ReceiveNewName", initialName);
        await SendPendingNamesAsync();
        await base.OnConnectedAsync();
    }

    private void StartNameUpdates()
    {
        lock (_timerLock)
        {
            if (_nameUpdateTimer == null)
            {
                _nameUpdateTimer = new System.Timers.Timer(10000); // 10 saniye
                _nameUpdateTimer.Elapsed += async (sender, e) => await SendNewNameToClients();
                _nameUpdateTimer.AutoReset = true; // Timer'ın sürekli çalışmasını sağlar
                _nameUpdateTimer.Enabled = true; // Timer'ı aktif eder
                _nameUpdateTimer.Start();
            }
        }
    }

    private async Task SendNewNameToClients()
    {
        string newName;
        lock (_timerLock)
        {
            newName = Names[_random.Next(Names.Length)];
        }

        try
        {
            await _hubContext.Clients.All.SendAsync("ReceiveNewName", newName);
        }
        catch
        {
            lock (_timerLock)
            {
                _pendingNames.Enqueue(newName);
                while (_pendingNames.Count > 10)
                {
                    _pendingNames.Dequeue();
                }
            }
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var connectionId = Context.ConnectionId;
        bool isTimeout = false;
        DateTime lastSeen;

        lock (_timerLock)
        {
            if (_activeConnections.TryGetValue(connectionId, out lastSeen))
            {
                isTimeout = (DateTime.UtcNow - lastSeen).TotalMinutes > CONNECTION_TIMEOUT_MINUTES;
                _activeConnections.Remove(connectionId);
            }
        }

        if (exception != null)
        {
            Console.WriteLine($"Client disconnected with error: {exception.Message}");
            await HandleErrorDisconnectionAsync(connectionId, exception);
        }
        else if (isTimeout)
        {
            Console.WriteLine($"Client connection timed out: {connectionId}");
            await HandleTimeoutDisconnectionAsync(connectionId);
        }
        else
        {
            Console.WriteLine($"Client disconnected normally: {connectionId}");
            await HandleNormalDisconnectionAsync(connectionId);
        }
        
        await base.OnDisconnectedAsync(exception);
    }

    private Task HandleErrorDisconnectionAsync(string connectionId, Exception exception)
    {
        // Handle error disconnections (network issues, crashes)
        return Task.CompletedTask;
    }

    private Task HandleTimeoutDisconnectionAsync(string connectionId)
    {
        // Handle timeout disconnections
        return Task.CompletedTask;
    }

    private Task HandleNormalDisconnectionAsync(string connectionId)
    {
        // Handle normal disconnections (browser/tab closed)
        return Task.CompletedTask;
    }

    private async Task SendPendingNamesAsync()
    {
        List<string> namesToSend;
        lock (_timerLock)
        {
            namesToSend = _pendingNames.ToList();
            _pendingNames.Clear();
        }

        foreach (var name in namesToSend)
        {
            try
            {
                await Clients.All.SendAsync("ReceiveNewName", name);
            }
            catch
            {
                lock (_timerLock)
                {
                    _pendingNames.Enqueue(name);
                }
                break;
            }
        }
    }

    private void StartConnectionHealthCheck()
    {
        var timer = new System.Timers.Timer(60000);
        timer.Elapsed += async (sender, e) => await CheckConnectionHealthAsync();
        timer.Start();
    }

    private async Task CheckConnectionHealthAsync()
    {
        List<string> timedOutConnections;
        var now = DateTime.UtcNow;

        lock (_timerLock)
        {
            timedOutConnections = _activeConnections
                .Where(c => (now - c.Value).TotalMinutes > CONNECTION_TIMEOUT_MINUTES)
                .Select(c => c.Key)
                .ToList();

            foreach (var connectionId in timedOutConnections)
            {
                _activeConnections.Remove(connectionId);
            }
        }

        foreach (var connectionId in timedOutConnections)
        {
            await HandleTimeoutDisconnectionAsync(connectionId);
        }
    }

    public static void StopNameUpdates()
    {
        lock (_timerLock)
        {
            if (_nameUpdateTimer != null)
            {
                _nameUpdateTimer.Stop();
                _nameUpdateTimer.Dispose();
                _nameUpdateTimer = null;
            }
        }
    }
} 