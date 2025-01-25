using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace SignalR_Timer.Pages;

public class IndexModel : PageModel
{
    private readonly ILogger<IndexModel> _logger;

    public bool EnableSignalR { get; private set; }
    public int InitialTime { get; private set; }

    public IndexModel(ILogger<IndexModel> logger)
    {
        _logger = logger;
    }

    public void OnGet(bool enableSignalR = true, int initialTime = 180)
    {
        EnableSignalR = enableSignalR;
        InitialTime = initialTime;
    }
}
